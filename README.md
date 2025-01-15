# Chatbot Project

This repository contains a chatbot built using OpenAI, LangChain, FastAPI, and Docker. The chatbot is designed to answer user queries with powerful language understanding capabilities, making it suitable for various applications such as customer support, e-commerce, or general Q&A.

# Prerequisites

- Docker: Ensure Docker is installed on your system.
- OpenAI API Key: Obtain an API key from OpenAI.

# Clone the Repository

    git clone https://github.com/sujit-dhakal/chat-bot.git

# Environment Variables

Create a .env file in the root directory and add the following:

    OPENAI_API_KEY=<your_openai_api_key>

# Build and Run with Docker

Build the Docker image:

    docker build -t chatbot .

Run the Docker container:

    docker run -d -p 8000:8000 --env-file .env chatbot

# API Endpoints

The chatbot API will be available at http://localhost:8000/docs.
