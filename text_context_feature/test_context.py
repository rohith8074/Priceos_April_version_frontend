#!/Users/rohithp/Desktop/Agent_preneur/priceos-latest2/priceos/venv/bin/python3
import os
import logging
import json
from dotenv import load_dotenv
from lyzr import Studio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("test_context.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def update_agent_context_strictly():
    """
    Updates the Global Context for an agent by removing existing ones and adding a new one.
    STRICTLY PROHIBITED: Updating agent instructions or prompts.
    """
    # 1. Load environment variables
    load_dotenv()
    api_key = os.getenv("LYZR_API_KEY")
    agent_id = os.getenv("AGENT_ID")
    
    if not api_key or not agent_id:
        logger.error("Missing LYZR_API_KEY or AGENT_ID in .env")
        return

    CONTEXT_NAME = "active_property_data_test"

    logger.info("="*50)
    logger.info(f"STRICT SINGLE CONTEXT UPDATE FOR AGENT: {agent_id}")
    logger.info("="*50)

    try:
        # 2. Initialize Lyzr Studio
        studio = Studio(api_key=api_key)
        agent = studio.get_agent(agent_id=agent_id)

        # 3. STUDIO-WIDE CLEANUP: Physically delete old contexts from the account
        logger.info(f"Scanning Lyzr Studio for contexts named: '{CONTEXT_NAME}'...")
        all_studio_contexts = studio.contexts.list() # Physically list all contexts in account
        
        deleted_count = 0
        logger.info(f"Found {len(all_studio_contexts)} total contexts in account.")
        
        for ctx in all_studio_contexts:
            # Extract name/id robustly
            if isinstance(ctx, dict):
                ctx_name = ctx.get('name', '')
                ctx_id = ctx.get('id', '')
            else:
                ctx_name = getattr(ctx, 'name', '')
                ctx_id = getattr(ctx, 'id', '')

            # Log every context for debugging
            logger.info(f"Checking Studio Context: '{ctx_name}' (ID: {ctx_id})")
            
            # Use stripped comparison to avoid whitespace issues
            if ctx_name.strip() == CONTEXT_NAME.strip():
                logger.info(f"MATCH FOUND. Physically DELETING context ID: {ctx_id}...")
                try:
                    studio.contexts.delete(context_id=ctx_id)
                    deleted_count += 1
                except Exception as del_err:
                    logger.warning(f"Failed to delete {ctx_id}: {del_err}")
        
        if deleted_count > 0:
            logger.info(f"SUCCESS: Purged {deleted_count} stale context(s) from Studio.")
        else:
            logger.info("No matching stale contexts found in account.")

        # 4. CREATE: New Property Context
        property_data = {
            "property_name": "Skylinehghgh ",
            "floor_price": "AED 2,100",
            "ceiling_price": "AED 4,500",
            "occupancy": "88%",
            "last_updated": "2026-03-02 12:53:00"
        }
        
        logger.info(f"Creating fresh '{CONTEXT_NAME}' in Studio...")
        ctx_obj = studio.create_context(
            name=CONTEXT_NAME,
            value=json.dumps(property_data)
        )
        
        # 5. PUSH: Associate with agent
        logger.info("Attaching new context to agent...")
        agent.add_context(ctx_obj)
        
        logger.info("✅ Single Context successfully updated.")

        # 6. VERIFY: Chat with agent
        logger.info("Verifying agent grounding...")
        response = agent.run("Confirm the floor price for the current penthouse in my context.")
        logger.info(f"Agent Response: {response.response}")

    except Exception as e:
        logger.error(f"Failed to update context: {e}", exc_info=True)

if __name__ == "__main__":
    update_agent_context_strictly()
