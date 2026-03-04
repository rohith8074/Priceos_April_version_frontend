#!/Users/rohithp/Desktop/Agent_preneur/priceos-latest2/venv/bin/python3
import os
from dotenv import load_dotenv
from lyzr import Studio

load_dotenv()
api_key = os.getenv("LYZR_API_KEY")
studio = Studio(api_key=api_key)
agent = studio.get_agent(agent_id=os.getenv("AGENT_ID"))

def find_methods(obj, name):
    print(f"\nSearching '{name}' for deletion/removal methods:")
    for attr in dir(obj):
        if "delete" in attr.lower() or "remove" in attr.lower() or "context" in attr.lower():
            try:
                val = getattr(obj, attr)
                print(f"  - {attr} (Type: {type(val)})")
            except:
                print(f"  - {attr} (Could not read)")

find_methods(studio, "Studio")
find_methods(agent, "Agent")
