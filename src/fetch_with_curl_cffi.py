#!/usr/bin/env python3
"""Fetch a page with curl_cffi using browser impersonation and retry logic."""

import random
import sys
import time

from curl_cffi import requests


RETRYABLE_STATUS_CODES = {403, 429, 503}

HEADERS = {
    "referer": "https://letterboxd.com/",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "upgrade-insecure-requests": "1",
}

IMPERSONATION_PROFILES = ("safari17_0", "chrome")


def fetch_with_profiles(session: requests.Session, url: str, timeout: tuple[int, int]):
    """Try browser fingerprints without delaying between profile-specific blocks."""
    last_response = None
    last_error = None

    for profile in IMPERSONATION_PROFILES:
        try:
            response = session.get(
                url,
                headers=HEADERS,
                timeout=timeout,
                impersonate=profile,
            )
            last_response = response
            if response.status_code == 200 and not is_cloudflare_block(response):
                return response, None
        except requests.errors.RequestsError as error:
            last_error = error

    return last_response, last_error


def is_cloudflare_block(response: requests.Response) -> bool:
    server_header = response.headers.get("Server", "").lower()
    has_cf_header = any(
        header in response.headers for header in ("cf-ray", "cf-cache-status", "cf-mitigated")
    )

    if response.status_code in RETRYABLE_STATUS_CODES and (
        has_cf_header or "cloudflare" in server_header or response.status_code == 403
    ):
        return True

    body = (response.text or "").lower()
    return (
        "cf_chl_" in body
        or ("just a moment" in body and "cloudflare" in body)
        or ("attention required" in body and "cloudflare" in body)
    )


def retry_delay(attempt: int, is_cf_retry: bool) -> float:
    base_seconds = 4.0 if is_cf_retry else 2.5
    growth = 1.9 if is_cf_retry else 1.5
    jitter = random.random() * 1.2
    return min(base_seconds * (growth ** (attempt - 1)) + jitter, 45.0)


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: fetch_with_curl_cffi.py <url> <retries>", file=sys.stderr)
        return 2

    url = sys.argv[1]
    retries = int(sys.argv[2])
    session = requests.Session()
    last_error = None

    for attempt in range(1, retries + 1):
        timeout = (10 + (attempt * 2), 30 + (attempt * 5))
        response, request_error = fetch_with_profiles(session, url, timeout)
        if (
            response is not None
            and response.status_code == 200
            and not is_cloudflare_block(response)
        ):
            sys.stdout.write(response.text)
            return 0

        if request_error is not None:
            last_error = request_error

        is_cf = response is not None and is_cloudflare_block(response)
        if attempt == retries:
            if is_cf:
                print(f"CLOUDFLARE_BLOCK {url} HTTP {response.status_code}", file=sys.stderr)
                return 86
            if response is not None:
                print(f"HTTP_ERROR {url} HTTP {response.status_code}", file=sys.stderr)
                return 87
            break

        wait_s = retry_delay(attempt, is_cf)
        reason = (
            "Cloudflare challenge"
            if is_cf
            else type(request_error).__name__ if request_error is not None
            else "request failure"
        )
        print(
            f"Attempt {attempt} failed ({reason}), retrying in {round(wait_s)}s...",
            file=sys.stderr,
        )
        time.sleep(wait_s)

    if last_error:
        print(f"NETWORK_ERROR {url} {type(last_error).__name__}: {last_error}", file=sys.stderr)
        return 88

    print(f"FAILED {url}", file=sys.stderr)
    return 89


if __name__ == "__main__":
    raise SystemExit(main())
