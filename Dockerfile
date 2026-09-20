FROM python:3.12-slim

WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y build-essential

# Copy python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the agentarmor source code
COPY agentarmor/ ./agentarmor/

# Expose the dynamic port (Railway sets $PORT at runtime)
ENV PORT=8000
EXPOSE $PORT

# Start the FastAPI server using Uvicorn
CMD ["sh", "-c", "uvicorn agentarmor.sentinel.main:app --host 0.0.0.0 --port $PORT"]
