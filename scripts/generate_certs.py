import os
from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

def generate_self_signed_cert(output_dir="certs"):
    """Generate self-signed SSL certificate (cert.pem) and private key (key.pem) for HTTPS."""
    os.makedirs(output_dir, exist_ok=True)
    
    cert_path = os.path.join(output_dir, "cert.pem")
    key_path = os.path.join(output_dir, "key.pem")

    if os.path.exists(cert_path) and os.path.exists(key_path):
        print(f"✅ SSL certificates already exist in {output_dir}/")
        return cert_path, key_path

    print(f"🔑 Generating 2048-bit RSA key pair for local HTTPS...")
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "State"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "City"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "LegalBot Local Enterprise"),
        x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
    ])

    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.now(timezone.utc)
    ).not_valid_after(
        datetime.now(timezone.utc) + timedelta(days=365)
    ).add_extension(
        x509.SubjectAlternativeName([
            x509.DNSName("localhost"),
            x509.DNSName("backend"),
            x509.DNSName("frontend"),
            x509.DNSName("127.0.0.1"),
        ]),
        critical=False,
    ).sign(key, hashes.SHA256())

    # Write private key
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))

    # Write certificate
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print(f"✅ Self-signed SSL certificate generated: {cert_path}")
    print(f"✅ Self-signed private key generated: {key_path}")
    return cert_path, key_path

if __name__ == "__main__":
    generate_self_signed_cert()
