from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from .. import models, schemas, auth
from ..websocket import manager

router = APIRouter(prefix="/tickets", tags=["Tickets"])

@router.post("", response_model=schemas.TicketResponse, status_code=status.HTTP_201_CREATED)
def create_ticket(
    ticket_in: schemas.TicketCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    new_ticket = models.Ticket(
        title=ticket_in.title,
        description=ticket_in.description,
        priority=ticket_in.priority,
        customer_id=current_user.id,
        status="open"
    )
    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)
    return new_ticket

@router.get("", response_model=List[schemas.TicketResponse])
def list_tickets(
    status: Optional[str] = Query(None, pattern="^(open|in_progress|resolved|closed)$"),
    priority: Optional[str] = Query(None, pattern="^(low|medium|high)$"),
    assigned_to: Optional[int] = Query(None),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Ticket)
    
    # Customer can only see their own tickets
    if current_user.role == "customer":
        query = query.filter(models.Ticket.customer_id == current_user.id)
    else:
        # Admins can filter by assigned_to
        if assigned_to is not None:
            query = query.filter(models.Ticket.assigned_to == assigned_to)
        
    if status:
        query = query.filter(models.Ticket.status == status)
    if priority:
        query = query.filter(models.Ticket.priority == priority)
        
    return query.all()

@router.get("/{ticket_id}", response_model=schemas.TicketDetailResponse)
def get_ticket(
    ticket_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        
    # Check permissions
    if current_user.role == "customer" and ticket.customer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only view your own tickets."
        )
        
    return ticket

@router.put("/{ticket_id}", response_model=schemas.TicketResponse)
async def update_ticket(
    ticket_id: int,
    ticket_update: schemas.TicketUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    # If customer, enforce they only update their own ticket and only if it's still 'open'
    if current_user.role == "customer":
        if ticket.customer_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You can only update your own tickets."
            )
        if ticket.status != "open":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify a ticket that is already in progress, resolved, or closed."
            )
            
        # Customer can only modify title, description, and priority (not status or assignment)
        if ticket_update.title is not None:
            ticket.title = ticket_update.title
        if ticket_update.description is not None:
            ticket.description = ticket_update.description
        if ticket_update.priority is not None:
            ticket.priority = ticket_update.priority
            
    # If admin, they can update everything including status
    elif current_user.role == "admin":
        if ticket_update.title is not None:
            ticket.title = ticket_update.title
        if ticket_update.description is not None:
            ticket.description = ticket_update.description
        if ticket_update.priority is not None:
            ticket.priority = ticket_update.priority
        if ticket_update.status is not None:
            ticket.status = ticket_update.status

    db.commit()
    db.refresh(ticket)
    
    # Broadcast ticket update
    try:
        ticket_data = jsonable_encoder(schemas.TicketResponse.model_validate(ticket))
        await manager.broadcast({
            "type": "ticket_updated",
            "ticket_id": ticket.id,
            "ticket": ticket_data
        })
    except Exception as e:
        print(f"Error broadcasting ticket update: {e}")

    return ticket

@router.put("/{ticket_id}/assign", response_model=schemas.TicketResponse)
async def assign_ticket(
    ticket_id: int,
    assignment: schemas.TicketAssign,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        
    if assignment.assigned_to is not None:
        # Verify assigned user exists and is an admin
        assigned_user = db.query(models.User).filter(models.User.id == assignment.assigned_to).first()
        if not assigned_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"User with ID {assignment.assigned_to} not found."
            )
        if assigned_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tickets can only be assigned to admins."
            )
        ticket.assigned_to = assignment.assigned_to
        ticket.assigned_name = assigned_user.full_name
        # Automatically transition open tickets to in_progress if assigned
        if ticket.status == "open":
            ticket.status = "in_progress"
    else:
        # Unassign
        ticket.assigned_to = None
        ticket.assigned_name = None

    db.commit()
    db.refresh(ticket)

    # Broadcast ticket update
    try:
        ticket_data = jsonable_encoder(schemas.TicketResponse.model_validate(ticket))
        await manager.broadcast({
            "type": "ticket_updated",
            "ticket_id": ticket.id,
            "ticket": ticket_data
        })
    except Exception as e:
        print(f"Error broadcasting ticket assignment: {e}")

    return ticket

@router.post("/{ticket_id}/comments", response_model=schemas.CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    ticket_id: int,
    comment_in: schemas.CommentCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
        
    # Customer can only comment on their own tickets
    if current_user.role == "customer" and ticket.customer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You can only comment on your own tickets."
        )
        
    new_comment = models.Comment(
        ticket_id=ticket.id,
        user_id=current_user.id,
        message=comment_in.message
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)

    # Broadcast new comment
    try:
        comment_data = jsonable_encoder(schemas.CommentResponse.model_validate(new_comment))
        ticket_data = jsonable_encoder(schemas.TicketResponse.model_validate(ticket))
        await manager.broadcast({
            "type": "new_comment",
            "ticket_id": ticket.id,
            "comment": comment_data,
            "ticket": ticket_data
        })
    except Exception as e:
        print(f"Error broadcasting new comment: {e}")

    return new_comment
