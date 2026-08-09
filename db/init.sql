-- Enable vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'LegalBot PostgreSQL initialized with pgvector successfully!';
END $$;
