from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import parse_qs, urlparse
from letterboxdpy import user as lb_user
from datetime import datetime

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # Parse query parameters
            parsed_url = urlparse(self.path)
            params = parse_qs(parsed_url.query)
            
            username = params.get('username', [None])[0]
            year = int(params.get('year', [datetime.now().year])[0])
            
            if not username:
                self.send_error_response(400, "Username is required")
                return
            
            # Use letterboxdpy to get user data
            user = lb_user.User(username)
            
            # Get diary entries for the specified year
            diary = user.get_diary(year=year)
            
            # Transform diary entries to our format
            entries = []
            for entry in diary:
                entry_data = {
                    "date": entry.get("date", ""),
                    "film": entry.get("name", ""),
                    "year": entry.get("release_year", ""),
                    "rating": None,
                    "rewatch": entry.get("rewatch", False),
                    "url": entry.get("film_url", "")
                }
                
                # Parse rating if available (letterboxdpy returns rating as string like "4.0")
                rating_str = entry.get("rating", "")
                if rating_str:
                    try:
                        entry_data["rating"] = float(rating_str)
                    except (ValueError, TypeError):
                        pass
                
                entries.append(entry_data)
            
            # Get user profile info
            profile = {
                "username": username,
                "displayName": getattr(user, 'name', username),
                "avatar": getattr(user, 'avatar', {}).get('url', '') if hasattr(user, 'avatar') and isinstance(getattr(user, 'avatar', None), dict) else '',
                "filmCount": len(entries)
            }
            
            # Send successful response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {
                "success": True,
                "profile": profile,
                "entries": entries,
                "year": year
            }
            
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            self.send_error_response(500, str(e))
    
    def send_error_response(self, status_code, message):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            "success": False,
            "error": message
        }
        
        self.wfile.write(json.dumps(response).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
