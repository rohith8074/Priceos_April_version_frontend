#!/Users/rohithp/Desktop/Agent_preneur/priceos-latest2/priceos/venv/bin/python3
import os
from dotenv import load_dotenv
from lyzr import Studio

load_dotenv()
api_key = os.getenv("LYZR_API_KEY")
studio = Studio(api_key=api_key)

print("Studio methods/attributes:")
for attr in dir(studio):
    if not attr.startswith("_"):
        print(f"  - {attr}")

print("\nAgent methods/attributes:")
agent = studio.get_agent(agent_id=os.getenv("AGENT_ID"))
for attr in dir(agent):
    if not attr.startswith("_"):
        print(f"  - {attr}")
