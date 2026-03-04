#!/Users/rohithp/Desktop/Agent_preneur/priceos-latest2/venv/bin/python3
import os
from dotenv import load_dotenv
from lyzr import Studio

load_dotenv()
api_key = os.getenv("LYZR_API_KEY")
studio = Studio(api_key=api_key)
agent = studio.get_agent(agent_id=os.getenv("AGENT_ID"))

print("Listing contexts for agent...")
contexts = agent.list_contexts()
if contexts:
    ctx = contexts[0]
    print(f"Context object Type: {type(ctx)}")
    print("Context methods/attributes:")
    for attr in dir(ctx):
        if not attr.startswith("_"):
            print(f"  - {attr}")
else:
    print("No contexts found on agent to inspect.")
