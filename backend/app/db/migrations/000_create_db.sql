-- Create the application role (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'user') THEN
        CREATE ROLE "user" WITH LOGIN PASSWORD 'password';
    END IF;
END
$$;

-- Create the database (will error if already exists; that's fine)
SELECT 'CREATE DATABASE incidentops OWNER "user"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'incidentops') \gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE incidentops TO "user";
