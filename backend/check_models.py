import os
from groq import Groq
from dotenv import load_dotenv

# Load your API key from the .env file
load_dotenv()
api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    raise RuntimeError("GROQ_API_KEY is not configured.")

print("Fetching available models...")

client = Groq(api_key=api_key)
for model in client.models.list().data:
    print(model.id)