from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict

from ..database import get_db
from .. import models, schemas, auth

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])

@router.get("/summary", response_model=schemas.ReportSummary)
def get_reports_summary(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    # Total tickets
    total_tickets = db.query(models.Ticket).count()
    
    # Status distribution
    status_query = db.query(models.Ticket.status, func.count(models.Ticket.id)).group_by(models.Ticket.status).all()
    status_counts = {"open": 0, "in_progress": 0, "resolved": 0, "closed": 0}
    for status, count in status_query:
        status_counts[status] = count
        
    # Priority distribution
    priority_query = db.query(models.Ticket.priority, func.count(models.Ticket.id)).group_by(models.Ticket.priority).all()
    priority_counts = {"low": 0, "medium": 0, "high": 0}
    for priority, count in priority_query:
        priority_counts[priority] = count
        
    # Unassigned tickets count
    unassigned_count = db.query(models.Ticket).filter(models.Ticket.assigned_to == None).count()
    
    # Ticket count per admin (agent)
    agent_query = (
        db.query(
            models.User.id,
            models.User.full_name,
            func.count(models.Ticket.id)
        )
        .join(models.Ticket, models.Ticket.assigned_to == models.User.id)
        .filter(models.User.role == "admin")
        .group_by(models.User.id, models.User.full_name)
        .all()
    )
    
    admin_counts = {agent_id: ticket_count for agent_id, _, ticket_count in agent_query}
    
    # Query all admins so we show 0 count admins as well
    all_admins = db.query(models.User).filter(models.User.role == "admin").all()
    
    agent_assignments = []
    for admin in all_admins:
        count = admin_counts.get(admin.id, 0)
        agent_assignments.append(
            schemas.AgentAssignmentInfo(
                agent_id=admin.id,
                agent_name=admin.full_name,
                ticket_count=count
            )
        )
        
    return schemas.ReportSummary(
        total_tickets=total_tickets,
        status_counts=status_counts,
        priority_counts=priority_counts,
        unassigned_count=unassigned_count,
        agent_assignments=agent_assignments
    )
