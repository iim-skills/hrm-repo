# HR Management System — Agent Instructions

## Project Overview
Build a policy-driven HR management system for employee attendance, leave handling, monthly summaries, tiering, and roster logic.

The system is being built in phases, starting from core employee + attendance management and ending with automated tiering and roster allocation.

## Tech Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- MongoDB

## Product Goals
- HR/Admin can manage all employees and attendance
- Managers can manage only their own team members
- Employees can view only their own data
- Attendance is manually controlled by HR/Manager, not auto-detected from login hours
- Monthly summaries drive tiering and roster logic
- All important changes must be auditable

## Core Domain Rules

### Attendance
- Attendance is HR/Manager controlled
- HR can view, mark, and edit every employee
- Managers can view, mark, and edit only their own team members
- Attendance edits are allowed only within 48 hours
- Every edit must store a mandatory reason note
- After 48 hours, attendance is locked

### Sick Leave
- Each employee gets 1 Paid Sick Leave (PSL) per month
- Unused PSL may carry forward only if the product logic allows it later
- If PSL is already used, the next absence becomes Leave Without Pay (LWP)
- LWP is an important input for tiering

### Half-Day
- Half-day is manually marked only
- No automatic half-day detection from hours
- HR/Manager/Admin can mark it
- Half-day forfeits WFH privilege for the current rolling week

### Sandwich Policy
- If an absence is adjacent to a rostered WFH day or off-day, raise a sandwich flag
- Sandwich cases may convert the block to LWP
- Medical certificate can override if supported by the product flow

### Monthly Freeze
- On the 1st of every month, the previous month is locked
- No edits after freeze
- Frozen monthly data is the source for tier calculation

### Tiering
- **Tier 1**: 0 PSL, 0 Half-Day, 0 LWP
- **Tier 2**: Exactly 1 PSL, no Half-Day, no LWP
- **Tier 3**: Any LWP, any Half-Day, or more than 1 absence
- Tiering runs on month-end using frozen monthly summary
- Tier history should be visible for at least 6 months

## Roles and Permissions

### HR / Admin
- Full access to all employees, attendance, leave, summaries, tiers, and reports
- Can add, edit, and deactivate any employee
- Provides login credentials (email + password) when adding employees

### Manager
- Access only to assigned team members
- Can add new employees to their own team (provides login credentials)
- Can mark and edit attendance only for their team
- Can view team summaries and reports

### Employee
- Can view only their own profile, attendance, leave balance, tier, and roster info

## Data Model Expectations
Use MongoDB collections for:
- `users`
- `employees`
- `attendance_records`
- `monthly_summaries`
- `leave_balances`
- `tier_history`
- `roster_assignments`
- `audit_logs`
- `medical_certificates`
- `sandwich_flags`

Design schemas to support:
- team-based access
- monthly locking
- audit trail
- historical reporting

## Build Approach
Work in phases only:
1. Auth + roles + employee management
2. Attendance + monthly summary + edit window
3. Sick leave + half-day + sandwich policy
4. Tiering + roster allocation + exports + analytics

Do not jump ahead unless the requested task requires it.

## Decision Rules for the Agent
When asked to build or change something:
1. Check whether the request belongs to current phase or future phase
2. Follow the domain rules above
3. Make the smallest possible change
4. Preserve existing behavior unless the request explicitly changes it
5. Prefer reusable components and modular services
6. Keep the UI simple, clean, and production-ready

## UI Style
- Sidebar-based dashboard layout
- Top bar with user info
- Tables for employee and attendance lists
- Badges for role, tier, and status
- Modals or pages for edit forms
- Clear loading, error, empty states
- Tailwind only for styling

## Code Standards
- Use TypeScript strictly
- Use reusable components
- Use clean folder structure
- Keep business logic separate from UI
- Validate all forms and inputs
- Use server-side checks for permissions
- Add audit logging wherever data is changed

## Non-Goals Unless Explicitly Requested
Do not build:
- unnecessary animations
- unrelated refactors
- alternate tech stacks
- extra features outside the defined HR workflow

## Output Expectations
When making changes:
- modify only the required files
- keep changes minimal
- maintain consistency with existing patterns
- include any necessary validation, permissions, and error handling

## Priority Order
If there is a conflict, follow this order:
1. User’s latest request
2. This `agent.md` file
3. Existing project patterns
4. General best practices

*Note: Attendance is manual. Tiering is automatic. Monthly freeze is strict. HR and Manager permissions must always be enforced.*
