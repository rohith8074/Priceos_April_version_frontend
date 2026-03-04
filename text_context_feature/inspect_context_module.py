#!/Users/rohithp/Desktop/Agent_preneur/priceos-latest2/venv/bin/python3
import os
from dotenv import load_dotenv
from lyzr import Studio

load_dotenv()
api_key = os.getenv("LYZR_API_KEY")
studio = Studio(api_key=api_key)

print(f"Inspecting studio.contexts ({type(studio.contexts)}):")
for attr in dir(studio.contexts):
    if not attr.startswith("_"):
        print(f"  - {attr}")
