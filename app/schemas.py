from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict
from datetime import datetime

# --- Token Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[str] = None


# --- User Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    full_name: str = Field(..., min_length=1, description="Full name cannot be empty")
    role: Optional[str] = Field("customer", pattern="^(customer|admin)$", description="Role must be customer or admin")

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

# Minimal user info for nesting in responses
class UserMinResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str

    class Config:
        from_attributes = True


# --- Comment Schemas ---
class CommentCreate(BaseModel):
    message: str = Field(..., min_length=1, description="Comment message cannot be empty")

class CommentResponse(BaseModel):
    id: int
    ticket_id: int
    user_id: int
    message: str
    created_at: datetime
    user: UserMinResponse

    class Config:
        from_attributes = True


# --- Ticket Schemas ---
class TicketCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=100, description="Title must be between 3 and 100 characters")
    description: str = Field(..., min_length=5, description="Description must be at least 5 characters")
    priority: Optional[str] = Field("medium", pattern="^(low|medium|high)$", description="Priority must be low, medium, or high")

class TicketUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=100)
    description: Optional[str] = Field(None, min_length=5)
    status: Optional[str] = Field(None, pattern="^(open|in_progress|resolved|closed)$")
    priority: Optional[str] = Field(None, pattern="^(low|medium|high)$")

class TicketAssign(BaseModel):
    assigned_to: Optional[int] = Field(..., description="ID of the user (admin) to assign the ticket to. Pass null to unassign.")

class TicketResponse(BaseModel):
    id: int
    title: str
    description: str
    status: str
    priority: str
    customer_id: int
    assigned_to: Optional[int] = None
    assigned_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    customer: UserMinResponse
    assigned_user: Optional[UserMinResponse] = None

    class Config:
        from_attributes = True

# Ticket detail response with comments
class TicketDetailResponse(TicketResponse):
    comments: List[CommentResponse] = []

    class Config:
        from_attributes = True


# --- Report Schemas ---
class AgentAssignmentInfo(BaseModel):
    agent_id: int
    agent_name: str
    ticket_count: int

class ReportSummary(BaseModel):
    total_tickets: int
    status_counts: Dict[str, int]
    priority_counts: Dict[str, int]
    unassigned_count: int
    agent_assignments: List[AgentAssignmentInfo]
