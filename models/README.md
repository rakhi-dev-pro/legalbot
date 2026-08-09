# Models Directory for Local LLM (llama.cpp)

Place your IBM Granite GGUF model files in this directory.

Recommended Model:
- `granite-3.1-8b-instruct.Q4_K_M.gguf` (or `granite-3.1-2b-instruct.Q4_K_M.gguf`)

You can download IBM Granite 3.1 GGUF models directly from Hugging Face:
- https://huggingface.co/ibm-granite/granite-3.1-8b-instruct-GGUF

When a GGUF file is placed here, update `docker-compose.yml` `llm-service` command flag `-m /models/<your-model-file.gguf>`.
