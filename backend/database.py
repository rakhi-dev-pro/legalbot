import logging
from typing import AsyncGenerator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import settings
from models import Base, RiskRulesConfig

logger = logging.getLogger("legalbot.database")

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for providing asynchronous database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


DEFAULT_RISK_RULES = [
    # --- General Commercial & Employment Rules ---
    {
        "category": "Indemnity",
        "default_risk_level": "High",
        "confidence_threshold": 0.75,
        "weight": 2.0,
        "description": "Clauses requiring one party to compensate the other for losses, damages, or legal fees."
    },
    {
        "category": "Unilateral Termination",
        "default_risk_level": "High",
        "confidence_threshold": 0.75,
        "weight": 1.8,
        "description": "Allows one party to terminate the contract without cause or with minimal notice."
    },
    {
        "category": "Limitation of Liability",
        "default_risk_level": "High",
        "confidence_threshold": 0.75,
        "weight": 1.8,
        "description": "Caps or excludes financial liability for damages, direct, or indirect losses."
    },
    {
        "category": "Non-Compete / Non-Solicitation",
        "default_risk_level": "Medium",
        "confidence_threshold": 0.70,
        "weight": 1.4,
        "description": "Restricts future employment, business operations, or soliciting clients/staff."
    },
    {
        "category": "Automatic Renewal",
        "default_risk_level": "Medium",
        "confidence_threshold": 0.70,
        "weight": 1.2,
        "description": "Contract automatically renews unless cancelled within a strict notice window."
    },
    {
        "category": "Governing Law & Jurisdiction",
        "default_risk_level": "Medium",
        "confidence_threshold": 0.65,
        "weight": 1.0,
        "description": "Designates governing state/country laws and dispute resolution courts."
    },
    {
        "category": "Confidentiality / NDA",
        "default_risk_level": "Medium",
        "confidence_threshold": 0.65,
        "weight": 1.0,
        "description": "Restricts disclosure of proprietary information and trade secrets."
    },
    {
        "category": "Arbitration",
        "default_risk_level": "Low",
        "confidence_threshold": 0.60,
        "weight": 0.8,
        "description": "Mandates private arbitration instead of trial by jury."
    },
    {
        "category": "Force Majeure",
        "default_risk_level": "Low",
        "confidence_threshold": 0.60,
        "weight": 0.5,
        "description": "Excuses contract performance during catastrophic extraordinary events."
    },
    {
        "category": "Probation Period & Evaluation",
        "default_risk_level": "Medium",
        "confidence_threshold": 0.70,
        "weight": 1.2,
        "description": "Subject to a mandatory probationary period before employment confirmation."
    },
    {
        "category": "Intellectual Property & IP Assignment",
        "default_risk_level": "Medium",
        "confidence_threshold": 0.70,
        "weight": 1.3,
        "description": "Mandates assignment of all inventions, software, trade secrets, and work product to employer."
    },

    # --- Tenant & Real Estate Lease Rules ---
    {
        "category": "Eviction & Notice to Vacate",
        "default_risk_level": "High",
        "confidence_threshold": 0.75,
        "weight": 2.0,
        "description": "Terms specifying summary eviction conditions, immediate lease forfeiture, or short notice to vacate."
    },
    {
        "category": "Late Rent Payment & Default Penalty",
        "default_risk_level": "High",
        "confidence_threshold": 0.75,
        "weight": 1.8,
        "description": "Penalties, compounding interest, or default fees imposed for late rent payments or non-payment."
    },
    {
        "category": "Security Deposit Forfeiture & Deductions",
        "default_risk_level": "High",
        "confidence_threshold": 0.75,
        "weight": 1.7,
        "description": "Conditions under which landlord can withhold security deposits, apply non-refundable deductions, or delay refunds."
    },
    {
        "category": "Rent Escalation & Auto-Increase",
        "default_risk_level": "Medium",
        "confidence_threshold": 0.70,
        "weight": 1.4,
        "description": "Provisions allowing landlord to automatically increase rent periodically or tie rent to index/inflation."
    },
    {
        "category": "Subleasing & Assignment Restriction",
        "default_risk_level": "Medium",
        "confidence_threshold": 0.70,
        "weight": 1.3,
        "description": "Restrictions prohibiting tenant from subletting, assigning lease, or transferring occupancy without consent."
    },
    {
        "category": "Maintenance & Repair Obligations",
        "default_risk_level": "Medium",
        "confidence_threshold": 0.65,
        "weight": 1.2,
        "description": "Assigns responsibility for structural repairs, plumbing, HVAC, or property damage costs to tenant."
    },
    {
        "category": "Landlord Entry & Inspection Rights",
        "default_risk_level": "Low",
        "confidence_threshold": 0.60,
        "weight": 0.8,
        "description": "Authorizes landlord or agents to enter premises for inspection, repairs, or showing prospective tenants/buyers."
    },
    {
        "category": "Utilities & Maintenance Fee Liabilities",
        "default_risk_level": "Low",
        "confidence_threshold": 0.60,
        "weight": 0.7,
        "description": "Mandates tenant payment of utility bills, trash removal, common area maintenance (CAM), or HOA dues."
    }
]


async def init_db():
    """Initialize database tables, vector extensions, HNSW indexes, and seed default risk rules."""
    async with engine.begin() as conn:
        # 1. Ensure extensions exist
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"))
        
        # 2. Create all tables
        await conn.run_sync(Base.metadata.create_all)
        
        # 3. Create HNSW Vector Index on document_chunks.embedding if not exists
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw 
            ON document_chunks 
            USING hnsw (embedding vector_cosine_ops);
        """))

        # 4. Schema migrations — add new columns to existing tables
        # Add recommendation column to risk_clauses if it doesn't exist
        await conn.execute(text("""
            DO $$ BEGIN
                ALTER TABLE risk_clauses ADD COLUMN recommendation TEXT;
            EXCEPTION
                WHEN duplicate_column THEN NULL;
            END $$;
        """))
    
    # 4. Seed missing risk rules into database
    async with AsyncSessionLocal() as session:
        for rule_data in DEFAULT_RISK_RULES:
            result = await session.execute(
                text("SELECT id FROM risk_rules_config WHERE category = :cat;"),
                {"cat": rule_data["category"]}
            )
            if not result.fetchone():
                logger.info(f"Seeding missing risk rule category: {rule_data['category']}")
                rule = RiskRulesConfig(**rule_data)
                session.add(rule)
        
        # 5. Seed default Admin user (admin@legalbot.com / password123) if missing
        admin_res = await session.execute(
            text("SELECT id FROM users WHERE email = 'admin@legalbot.com';")
        )
        if not admin_res.fetchone():
            from services.auth_service import hash_password
            from models import User
            logger.info("Seeding default admin user: admin@legalbot.com")
            admin_user = User(
                email="admin@legalbot.com",
                password_hash=hash_password("password123"),
                full_name="System Administrator",
                role="admin",
                is_active=True
            )
            session.add(admin_user)

        await session.commit()

