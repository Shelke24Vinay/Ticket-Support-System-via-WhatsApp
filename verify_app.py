import sys
import os
from fastapi.testclient import TestClient

# Add current directory to path so app can be imported
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.main import app
from app.database import Base, engine

# Force creation of a fresh test SQLite database in memory
# (This ensures the test runs in a clean, isolated environment)
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

client = TestClient(app)

def print_section(title: str):
    print("\n" + "=" * 60)
    print(f" {title} ".center(60, "="))
    print("=" * 60)

def test_flow():
    # 1. Health check
    print_section("1. Health Check")
    res = client.get("/api/health")
    assert res.status_code == 200
    print("[PASS] API health endpoint healthy:", res.json())

    # 2. Registration
    print_section("2. Registration Tests")
    # Customer 1
    res = client.post("/auth/register", json={
        "email": "customer1@example.com",
        "password": "password123",
        "full_name": "Alice Smith",
        "role": "customer"
    })
    assert res.status_code == 201
    print("[PASS] Registered Customer 1:", res.json())

    # Customer 2
    res = client.post("/auth/register", json={
        "email": "customer2@example.com",
        "password": "password456",
        "full_name": "Bob Johnson",
        "role": "customer"
    })
    assert res.status_code == 201
    print("[PASS] Registered Customer 2")

    # Admin 1
    res = client.post("/auth/register", json={
        "email": "admin1@example.com",
        "password": "adminpassword",
        "full_name": "Charlie Manager",
        "role": "admin"
    })
    assert res.status_code == 201
    admin1_id = res.json()["id"]
    print("[PASS] Registered Admin 1:", res.json())

    # Admin 2
    res = client.post("/auth/register", json={
        "email": "admin2@example.com",
        "password": "adminpassword2",
        "full_name": "Dana Agent",
        "role": "admin"
    })
    assert res.status_code == 201
    print("[PASS] Registered Admin 2")

    # 3. Authentication
    print_section("3. Login and Token Verification")
    
    # Customer 1 login
    res = client.post("/auth/login", data={
        "username": "customer1@example.com",
        "password": "password123"
    })
    assert res.status_code == 200
    cust1_token = res.json()["access_token"]
    cust1_headers = {"Authorization": f"Bearer {cust1_token}"}
    print("[PASS] Logged in Customer 1 and retrieved JWT token.")

    # Admin 1 login
    res = client.post("/auth/login", data={
        "username": "admin1@example.com",
        "password": "adminpassword"
    })
    assert res.status_code == 200
    admin1_token = res.json()["access_token"]
    admin1_headers = {"Authorization": f"Bearer {admin1_token}"}
    print("[PASS] Logged in Admin 1 and retrieved JWT token.")

    # Profile check /auth/me
    res = client.get("/auth/me", headers=cust1_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "customer1@example.com"
    print("[PASS] Retrieved Customer 1 profile information:", res.json())

    # 4. Ticket Lifecycle
    print_section("4. Support Ticket Creation & Permissions")
    
    # Customer 1 raises ticket
    res = client.post("/tickets", headers=cust1_headers, json={
        "title": "Cannot access Supabase database",
        "description": "I get a connection timeout whenever I try to fetch tickets.",
        "priority": "high"
    })
    assert res.status_code == 201
    ticket_id = res.json()["id"]
    print("[PASS] Customer 1 raised support ticket:", res.json())

    # Customer 1 views own tickets
    res = client.get("/tickets", headers=cust1_headers)
    assert res.status_code == 200
    assert len(res.json()) == 1
    assert res.json()[0]["title"] == "Cannot access Supabase database"
    print("[PASS] Customer 1 verified their ticket lists successfully.")

    # Customer 2 should not see Customer 1's ticket
    res = client.post("/auth/login", data={
        "username": "customer2@example.com",
        "password": "password456"
    })
    cust2_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    res = client.get("/tickets", headers=cust2_headers)
    assert res.status_code == 200
    assert len(res.json()) == 0
    print("[PASS] Customer 2 cannot see Customer 1's ticket.")

    # Customer 2 tries to fetch Customer 1's ticket directly
    res = client.get(f"/tickets/{ticket_id}", headers=cust2_headers)
    assert res.status_code == 403
    print("[PASS] Customer 2 forbidden from accessing Customer 1's ticket directly.")

    # Admin 1 lists all tickets (should see it)
    res = client.get("/tickets", headers=admin1_headers)
    assert res.status_code == 200
    assert len(res.json()) == 1
    print("[PASS] Admin 1 listed all tickets and found Customer 1's ticket.")

    # 5. Commenting Flow
    print_section("5. Comments and Collaboration")
    # Customer 1 adds a comment
    res = client.post(f"/tickets/{ticket_id}/comments", headers=cust1_headers, json={
        "message": "Update: I checked my firewall, it is still failing."
    })
    assert res.status_code == 201
    print("[PASS] Customer 1 posted a comment:", res.json())

    # Admin 1 adds response comment
    res = client.post(f"/tickets/{ticket_id}/comments", headers=admin1_headers, json={
        "message": "Hello Alice, I am taking a look at this. It might be due to transaction-mode pooler port settings."
    })
    assert res.status_code == 201
    print("[PASS] Admin 1 posted a response comment:", res.json())

    # Fetch detail view (should contain both comments)
    res = client.get(f"/tickets/{ticket_id}", headers=cust1_headers)
    assert res.status_code == 200
    detail = res.json()
    assert len(detail["comments"]) == 2
    print("[PASS] Retrieved ticket details along with full comments thread:")
    for comment in detail["comments"]:
        print(f"  - [{comment['user']['role'].upper()}] {comment['user']['full_name']}: {comment['message']}")

    # 6. Ticket Assignment & Management
    print_section("6. Ticket Assignment & Status Updates")
    # Admin 1 assigns ticket to themselves
    res = client.put(f"/tickets/{ticket_id}/assign", headers=admin1_headers, json={
        "assigned_to": admin1_id
    })
    assert res.status_code == 200
    assert res.json()["assigned_to"] == admin1_id
    # Check that status automatically moved to "in_progress"
    assert res.json()["status"] == "in_progress"
    print("[PASS] Admin 1 assigned ticket to themselves, auto-updating status to 'in_progress':", res.json())

    # Customer 1 tries to update status (should be forbidden or ignored/status change disallowed for customers)
    res = client.put(f"/tickets/{ticket_id}", headers=cust1_headers, json={
        "status": "resolved"
    })
    # For a customer, updating status is either forbidden or raises 400 since ticket is no longer open
    assert res.status_code in [400, 403]
    print(f"[PASS] Customer disallowed from updating status of an in-progress ticket (Status: {res.status_code}).")

    # Admin 1 resolves the ticket
    res = client.put(f"/tickets/{ticket_id}", headers=admin1_headers, json={
        "status": "resolved"
    })
    assert res.status_code == 200
    assert res.json()["status"] == "resolved"
    print("[PASS] Admin 1 resolved the ticket.")

    # 7. Reporting & Analytics
    print_section("7. Admin Reporting Summary")
    # Customer 1 tries to fetch reports (should be forbidden)
    res = client.get("/reports/summary", headers=cust1_headers)
    assert res.status_code == 403
    print("[PASS] Customer forbidden from viewing reporting summary.")

    # Admin 1 fetches reports
    res = client.get("/reports/summary", headers=admin1_headers)
    assert res.status_code == 200
    report = res.json()
    assert report["total_tickets"] == 1
    assert report["status_counts"]["resolved"] == 1
    assert report["priority_counts"]["high"] == 1
    assert report["unassigned_count"] == 0
    
    # Check admin assignments (admin1 should have 1 ticket)
    admin1_assignment = next(a for a in report["agent_assignments"] if a["agent_id"] == admin1_id)
    assert admin1_assignment["ticket_count"] == 1
    print("[PASS] Admin 1 fetched reporting summary successfully:", report)

    print("\n" + "=" * 60)
    print(" ALL API VERIFICATION TESTS PASSED SUCCESSFULLY! ".center(60, "*"))
    print("=" * 60)

if __name__ == "__main__":
    test_flow()
