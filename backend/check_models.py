import os

from dotenv import load_dotenv
from google import genai

# Load your API key from the .env file
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("Fetching available models...")

# Loop through and print every model your key can list
for m in client.models.list():
    print(m.name)
