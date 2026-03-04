import httpx
import os
from dotenv import load_dotenv
import json

load_dotenv()

API_KEY = os.getenv("LYZR_API_KEY")
BASE_URL = "https://agent-prod.studio.lyzr.ai/v3"

def probe_endpoint(path, method="GET", json_data=None):
    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json"
    }
    url = f"{BASE_URL}/{path}"
    print(f"Probing {method} {url}...")
    try:
        if method == "GET":
            response = httpx.get(url, headers=headers)
        elif method == "POST":
            response = httpx.post(url, headers=headers, json=json_data)
        
        print(f"Status: {response.status_code}")
        if response.status_code < 400:
            try:
                print("Response:", json.dumps(response.json(), indent=2))
            except:
                print("Response (text):", response.text[:200])
        else:
            print("Error:", response.text[:200])
        return response
    except Exception as e:
        print(f"Request failed: {e}")
        return None

if __name__ == "__main__":
    if not API_KEY:
        print("API_KEY not found in .env")
    else:
        # Try to list contexts
        probe_endpoint("contexts/")
        probe_endpoint("context/")
        
        # Try to list agents (to see if context is in their config)
        probe_endpoint("agents/")
