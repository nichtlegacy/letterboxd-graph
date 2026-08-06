import importlib.util
import unittest
from pathlib import Path
from unittest.mock import Mock


SCRIPT_PATH = Path(__file__).parents[1] / "src" / "fetch_with_curl_cffi.py"
SPEC = importlib.util.spec_from_file_location("fetch_with_curl_cffi", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FetchWithProfilesTests(unittest.TestCase):
    def test_chrome_profile_follows_safari_cloudflare_block_without_delay(self):
        blocked = Mock(status_code=403, text="cf_chl_", headers={"Server": "cloudflare"})
        success = Mock(status_code=200, text="<table id='diary-table'></table>", headers={})
        session = Mock()
        session.get.side_effect = [blocked, success]

        response, error = MODULE.fetch_with_profiles(session, "https://example.test", (12, 35))

        self.assertIs(response, success)
        self.assertIsNone(error)
        self.assertEqual(
            [call.kwargs["impersonate"] for call in session.get.call_args_list],
            ["safari17_0", "chrome"],
        )

    def test_status_200_cloudflare_challenge_is_not_accepted(self):
        blocked = Mock(status_code=200, text="<title>Just a moment</title> Cloudflare cf_chl_", headers={})
        success = Mock(status_code=200, text="<table id='diary-table'></table>", headers={})
        session = Mock()
        session.get.side_effect = [blocked, success]

        response, error = MODULE.fetch_with_profiles(session, "https://example.test", (12, 35))

        self.assertIs(response, success)
        self.assertIsNone(error)


if __name__ == "__main__":
    unittest.main()
