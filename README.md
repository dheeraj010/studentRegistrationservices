# SMS Microservices — Student Management System

A **Node.js microservices application** for student management with distributed request tracing via **correlation IDs**, **Winston + Elasticsearch** logging, and **JWT-based RBAC** security.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Correlation ID Tracing](#correlation-id-tracing)
- [Logging & Elasticsearch](#logging--elasticsearch)
- [Testing](#testing)
- [Debug Endpoint](#debug-endpoint)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT REQUEST                              │
│                  Header: x-correlation-id: <uuid>                    │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
         ┌──────────────────┬─────────┴────────┬──────────────────┐
         ▼                  ▼                  ▼                  ▼
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │ authService  │   │  studentSvc  │   │ professorSvc │   │   gradeSvc   │
  │  Port 5001   │   │  Port 5003   │   │  Port 5002   │   │  Port 5006   │
  └──────┬───────┘   └──────────────┘   └──────────────┘   └──────┬───────┘
         │ fetches students/professors                            │ verifies student,
         ▼                                                        │ course & enrollment
  ┌──────────────┐          ┌──────────────────┐                  │
  │  courseSvc   │◄─────────│  enrollmentSvc   │◄─────────────────┘
  │  Port 5004   │          │  Port 5005       │
  └──────────────┘          └──────────────────┘
                            │
                            ▼
                 ┌──────────────────┐
                 │  Elasticsearch   │
                 │  (sms-logs-*)    │
                 └──────────────────┘
```

### Services

| Service             | Port | Description                                       |
|---------------------|------|---------------------------------------------------|
| **authService**     | 5001 | JWT login, public key distribution (JWKS)         |
| **professorService**| 5002 | Professor CRUD                                    |
| **studentService**  | 5003 | Student CRUD                                      |
| **courseService**    | 5004 | Course CRUD (created by professors)               |
| **enrollmentService** | 5005 | Enrollment CRUD, calls student + course services |
| **gradeService**     | 5006 | Grade CRUD, verifies student, course, & enrollment|

### Shared Modules (root level)

| File               | Purpose                                                          |
|--------------------|------------------------------------------------------------------|
| `correlationId.js` | Middleware to generate/extract `x-correlation-id` via `cls-hooked` |
| `logging.js`       | Winston loggers per service with Elasticsearch transport         |
| `consts.js`        | Service URLs, role constants                                     |

---

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB Atlas
- **Auth**: JWT (RS256) with JWKS key discovery
- **Logging**: Winston + `winston-elasticsearch`
- **Tracing**: `cls-hooked` + `uuid` for correlation IDs
- **HTTP Client**: Axios (with interceptors for header propagation)
- **Dev Tools**: Nodemon, Concurrently

---

## Project Structure

```
SMS-Template/
├── package.json                  ← Root: concurrently starts all services
├── correlationId.js              ← Correlation ID middleware (cls-hooked)
├── logging.js                    ← Winston loggers + Elasticsearch transport
├── consts.js                     ← Service URLs + role constants
├── test_api.js                   ← End-to-end test script
│
├── authService/
│   ├── .env                      ← PORT=5001, MONGO_URI, ADMIN_PASSWORD
│   ├── index.js                  ← Express app entry point
│   └── routes/auth/
│       ├── loginRoute.js         ← Login endpoints + debug error endpoint
│       ├── publicKeyRoute.js     ← JWKS public key endpoint
│       ├── util.js               ← JWT verify, axios interceptors
│       └── keys/                 ← RSA key pair (private.key, public.key)
│
├── studentService/
│   ├── .env                      ← PORT=5003, MONGO_URI
│   ├── index.js
│   ├── config/db.js              ← MongoDB connection
│   ├── models/student.js         ← Mongoose model
│   └── routes/
│       ├── studentRoute.js       ← Student CRUD routes with logging
│       └── auth/util.js          ← JWT verify, axios interceptors
│
├── professorService/
│   ├── .env                      ← PORT=5002, MONGO_URI
│   ├── index.js
│   ├── config/db.js
│   ├── models/professor.js
│   └── routes/
│       ├── professorRoute.js     ← Professor CRUD routes
│       └── auth/util.js
│
├── courseService/
│   ├── .env                      ← PORT=5004, MONGO_URI
│   ├── index.js
│   ├── config/db.js
│   ├── models/course.js
│   └── routes/
│       ├── courseRoute.js         ← Course CRUD routes
│       └── auth/util.js
│
├── enrollmentService/
│   ├── .env                      ← PORT=5005, MONGO_URI
│   ├── index.js
│   ├── config/db.js
│   ├── models/enrollment.js
│   └── routes/
│       ├── enrollmentRoute.js    ← Enrollment routes (calls student + course)
│       └── auth/
│           ├── util.js           ← JWT verify, axios interceptors, fetch helpers
│           └── publicKeyRoute.js
│
└── gradeService/
    ├── .env                      ← PORT=5006, MONGO_URI
    ├── index.js                  ← Express app entry point
    ├── config/db.js              ← MongoDB connection
    ├── models/grade.js           ← Mongoose model
    └── routes/
        ├── gradeRoute.js         ← Grade CRUD routes
        └── auth/
            ├── util.js           ← JWT verify, axios interceptors, fetch helpers
            ├── publicKeyRoute.js
            └── keys/             ← RSA key pair (private.key, public.key)
```

---

## Prerequisites

- **Node.js** ≥ 16.x
- **npm** ≥ 8.x
- **MongoDB** (uses MongoDB Atlas by default — connection strings in `.env` files)
- **Elasticsearch** (optional, for centralized log searching)

---

## Environment Setup

Each service has its own `.env` file. The key variables are:

```env
# Required for all services
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?appName=<app>
PORT=<port>

# authService only
ADMIN_PASSWORD=admin
```

### Default Ports

| Service           | Port |
|-------------------|------|
| authService       | 5001 |
| professorService  | 5002 |
| studentService    | 5003 |
| courseService     | 5004 |
| enrollmentService | 5005 |
| gradeService      | 5006 |

> **Note**: The service URLs in `consts.js` must match these ports. If you change a port, update `consts.js` too.

---

## Installation

### 1. Install root dependencies (concurrently, winston, cls-hooked, uuid)

```bash
cd SMS-Template
npm install
```

### 2. Install dependencies for each microservice

```bash
npm install --prefix ./authService
npm install --prefix ./studentService
npm install --prefix ./professorService
npm install --prefix ./courseService
npm install --prefix ./enrollmentService
npm install --prefix ./gradeService
```

### Or install everything at once

```bash
npm install && npm install --prefix ./authService && npm install --prefix ./studentService && npm install --prefix ./professorService && npm install --prefix ./courseService && npm install --prefix ./enrollmentService && npm install --prefix ./gradeService
```

---

## Running the Application

### Start all services simultaneously (recommended)

```bash
npm run start:all
```

This uses `concurrently` to launch all 6 services. Each service gets a color-coded label in the terminal.

### Start individual services

```bash
npm run start:authService
npm run start:professorService
npm run start:studentService
npm run start:courseService
npm run start:enrollmentService
npm run start:gradeService
```

### Expected startup output

```
[authService]       Auth Server running on port 5001
[professorService]  Professor Server running on port 5002
[studentService]    Student Service is running on port 5003
[courseService]     Course Server running on port 5004
[enrollmentService] Enrollment running on port 5005
[gradeService]      Grade Server running on port 5006
```

---

## API Endpoints

### Auth Service (Port 5001)

| Method | Endpoint                            | Auth Required | Description                  |
|--------|-------------------------------------|---------------|------------------------------|
| POST   | `/api/login/student`                | No            | Login as student             |
| POST   | `/api/login/professor`              | No            | Login as professor           |
| POST   | `/api/login/admin`                  | No            | Login as admin               |
| GET    | `/.well-known/jwks.json`            | No            | JWKS public key              |
| GET    | `/api/login/debug/error-propagate`  | No            | Debug error endpoint         |

### Student Service (Port 5003)

| Method | Endpoint            | Roles Allowed                                     | Description       |
|--------|---------------------|---------------------------------------------------|-------------------|
| POST   | `/api/students`     | Public                                            | Create student    |
| GET    | `/api/students`     | Admin, Professor, Enrollment Service, Auth Service| Get all students  |
| GET    | `/api/students/:id` | Admin, Professor, Student (own), Enrollment Svc   | Get one student   |
| PUT    | `/api/students/:id` | Admin, Student (own)                              | Update student    |
| DELETE | `/api/students/:id` | Admin                                             | Delete student    |

### Professor Service (Port 5002)

| Method | Endpoint               | Roles Allowed            | Description        |
|--------|------------------------|--------------------------|--------------------|
| POST   | `/api/professors`      | Public                   | Create professor   |
| GET    | `/api/professors`      | Admin, Auth Service      | Get all professors |
| GET    | `/api/professors/:id`  | Admin, Professor (own)   | Get one professor  |
| PUT    | `/api/professors/:id`  | Admin, Professor (own)   | Update professor   |
| DELETE | `/api/professors/:id`  | Admin                    | Delete professor   |

### Course Service (Port 5004)

| Method | Endpoint            | Roles Allowed                       | Description     |
|--------|---------------------|-------------------------------------|-----------------|
| POST   | `/api/courses`      | Admin, Professor                    | Create course   |
| GET    | `/api/courses`      | Admin, Professor, Enrollment Svc    | Get all courses |
| GET    | `/api/courses/:id`  | Admin, Professor, Enrollment Svc    | Get one course  |
| PUT    | `/api/courses/:id`  | Admin, Professor (creator only)     | Update course   |
| DELETE | `/api/courses/:id`  | Admin, Professor (creator only)     | Delete course   |

### Enrollment Service (Port 5005)

| Method | Endpoint                         | Roles Allowed                         | Description             |
|--------|----------------------------------|---------------------------------------|-------------------------|
| POST   | `/api/enrollments`               | Admin, Professor                      | Create enrollment       |
| GET    | `/api/enrollments`               | Admin, Professor                      | Get all enrollments     |
| GET    | `/api/enrollments/:id`           | Admin, Professor                      | Get one enrollment      |
| GET    | `/api/enrollments/student/:id`   | Admin, Professor, Student, Grade Serv | Enrollments by student  |
| GET    | `/api/enrollments/course/:id`    | Admin, Professor, Grade Service       | Enrollments by course   |
| GET    | `/api/enrollments/lookup`        | Admin, Grade Service                  | Lookup specific enrollment|
| DELETE | `/api/enrollments/:id`           | Admin, Professor                      | Delete enrollment       |

### Grade Service (Port 5006)

| Method | Endpoint                         | Roles Allowed                         | Description             |
|--------|----------------------------------|---------------------------------------|-------------------------|
| POST   | `/api/grades`                    | Admin, Professor                      | Assign grade            |
| GET    | `/api/grades`                    | Admin, Professor                      | Get all grades          |
| GET    | `/api/grades/:id`                | Admin, Professor                      | Get grade by ID         |
| GET    | `/api/grades/student/:studentId` | Admin, Professor, Student             | Grades by student ID    |
| GET    | `/api/grades/course/:courseId`   | Admin, Professor                      | Grades by course ID     |
| PUT    | `/api/grades/:id`                | Admin, Professor (grader)             | Update grade            |
| DELETE | `/api/grades/:id`                | Admin                                 | Delete grade            |
| GET    | `/.well-known/jwks.json`         | No                                    | JWKS public key         |

---

## Correlation ID Tracing

Every request is tagged with a unique **correlation ID** that follows it across all services. This enables end-to-end debugging of multi-service requests.

### How It Works

1. **Client sends** `x-correlation-id` header (or one is auto-generated via UUID)
2. **Middleware captures** the ID using `cls-hooked` (continuation-local storage)
3. **Every log entry** includes the correlation ID
4. **Outgoing service calls** propagate the ID via Axios interceptors
5. **Response returns** the correlation ID in the response header

### Request Flow Example

```
Client  ──(x-correlation-id: trace-001)──►  authService
                                              │ logs: "POST /api/login - cid:trace-001"
                                              │
                                              ├──► studentService
                                              │     logs: "GET /api/students - cid:trace-001"
                                              │     returns 200
                                              │
                                              ◄── returns 201 with x-correlation-id: trace-001

Elasticsearch query: correlationId: "trace-001"
→ Returns ALL logs from both services for this request
```

### Multi-Service Flow (Enrollment)

```
POST /api/enrollments  (cid: enroll-789)
    │
    ├──► enrollmentService logs: "Received enrollment request"
    │
    ├──► GET studentService/api/students/:id  (cid: enroll-789)
    │    └── studentService logs: "Fetching student"
    │
    ├──► GET courseService/api/courses/:id  (cid: enroll-789)
    │    └── courseService logs: "Fetching course"
    │
    └── enrollmentService logs: "Enrollment created successfully"

One query → See all 4+ log entries across 3 services
```

### Manual Request with Correlation ID

```bash
curl -X POST http://localhost:5001/api/login/student \
  -H "x-correlation-id: my-trace-123" \
  -H "Content-Type: application/json" \
  -d '{"email":"student@test.com","password":"password123"}'
```

---

## Logging & Elasticsearch

### Log Format

Every log entry is a JSON object:

```json
{
  "timestamp": "2026-05-29T10:30:45.123Z",
  "level": "info",
  "message": "POST /api/login/student - cid:trace-001",
  "correlationId": "trace-001"
}
```

### Elasticsearch Transport

Logs are sent to Elasticsearch under the index prefix `sms-logs-*`. Configuration is in `logging.js`.

### Search Elasticsearch

```bash
# All logs for a specific trace
curl "http://<elasticsearch-host>:9200/sms-logs-*/_search?q=correlationId:trace-001"

# Errors only for a trace
curl -X GET "http://<elasticsearch-host>:9200/sms-logs-*/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "bool": {
        "must": [
          { "match": { "correlationId": "trace-001" } },
          { "match": { "level": "error" } }
        ]
      }
    }
  }'

# Logs from a specific service
curl "http://<elasticsearch-host>:9200/sms-logs-*/_search?q=correlationId:trace-001+AND+appName:enrollmentService"
```

### Kibana Dashboard

1. Navigate to `http://<elasticsearch-host>:5601`
2. Go to **Discover**
3. Select index pattern: `sms-logs-*`
4. Add filter: `correlationId: "trace-001"`
5. Sort by timestamp to see the full request flow

---

## Testing

### Run the full test suite

```bash
node test_api.js
```

This script:
- Generates a unique correlation ID (`test-<timestamp>`)
- Creates a student and professor
- Logs in as student, professor, and admin
- Creates a course
- Enrolls a student
- Tests access control
- All requests carry the same correlation ID for traceability

### Example test output

```
=== SMS Microservices API Test ===
Correlation ID for this test run: test-1717002345678

1. Creating test student...     ✓
2. Creating test professor...   ✓
3. Login as student...          ✓
4. Login as professor...        ✓
5. Login as admin...            ✓
6. Creating course...           ✓
7. Enrolling student...         ✓
...
```

### Postman Collection

Import `SMS_Microservices.postman_collection.json` for pre-configured API requests.

---

## Debug Endpoint

An intentional error endpoint exists for testing correlation ID propagation in error scenarios:

```bash
curl http://localhost:5001/api/login/debug/error-propagate \
  -H "x-correlation-id: debug-error-001"
```

**What happens:**
1. Auth service receives request with `cid:debug-error-001`
2. Tries to connect to `http://localhost:5999/boom` (non-existent)
3. Connection fails with `ECONNREFUSED`
4. Error is logged with correlation ID `debug-error-001`
5. Returns HTTP 500

**Check logs for:**
```json
{
  "level": "error",
  "message": "Debug outgoing error: connect ECONNREFUSED 127.0.0.1:5999 - cid:debug-error-001",
  "correlationId": "debug-error-001"
}
```

This demonstrates that errors carry the same correlation ID, making them searchable alongside the rest of the request chain.

---

## Troubleshooting

### Services won't start

- **Port in use**: Check if another process is using ports 5001–5005
  ```bash
  # Windows
  netstat -ano | findstr :5001
  # macOS/Linux
  lsof -i :5001
  ```
- **Missing dependencies**: Run `npm install` in each service directory
- **MongoDB connection**: Verify `MONGO_URI` in each `.env` file

### Correlation ID not appearing in logs

- Ensure `correlationIdMiddleware` is registered **before** routes in each `index.js`
- Verify client sends the `x-correlation-id` header
- Check that `cls-hooked` is installed: `npm ls cls-hooked`

### Logs not reaching Elasticsearch

- Verify Elasticsearch is running and accessible
- Check credentials in `logging.js` (`clientOpts.auth`)
- Monitor console for Winston transport errors

### Axios interceptors not propagating correlation ID

- Ensure `axiosInstance` (not plain `axios`) is used for all outgoing calls
- Verify `getCorrelationId()` returns a value inside the request context
- Check that interceptors are registered before any HTTP calls

### JWT verification fails

- Ensure the JWKS endpoint (`/.well-known/jwks.json`) is accessible on the calling service's port
- Check that RSA keys exist in `routes/auth/keys/`
- Verify `kid` and `jku` match between services

---

## Roles & Access Control

```javascript
const ROLES = {
  STUDENT: "student",
  PROFESSOR: "professor",
  ADMIN: "admin",
  AUTH_SERVICE: "auth_service",
  ENROLLMENT_SERVICE: "enrollment_service",
  GRADE_SERVICE: "grade_service",
};
```

- **Admin**: Full access to all endpoints
- **Professor**: CRUD on courses they created, read students, manage enrollments, assign grades
- **Student**: Read/update own data, view own enrollments/grades
- **Auth Service**: Internal role for service-to-service calls from auth
- **Enrollment Service**: Internal role for service-to-service calls from enrollment
- **Grade Service**: Internal role for service-to-service calls from grade service

---

## Implementation Patterns

### 1. Correlation ID Middleware (every service `index.js`)

```javascript
const { correlationIdMiddleware, getCorrelationId } = require("../correlationId");

app.use(express.json());
app.use(correlationIdMiddleware);                           // Capture ID
app.use((req, res, next) => {                               // Log requests
  logger.info(`${req.method} ${req.originalUrl} - cid:${getCorrelationId()}`);
  next();
});
app.use("/api/...", routes);                                // Routes
app.use((err, req, res, next) => {                          // Error handler
  logger.error(`Unhandled error: ${err.message} - cid:${getCorrelationId()}`);
  res.status(500).json({ message: "Internal Server Error" });
});
```

### 2. Axios Interceptors (every service `auth/util.js`)

```javascript
const axiosInstance = axios.create();

axiosInstance.interceptors.request.use((config) => {
  const cid = getCorrelationId();
  if (cid) config.headers["x-correlation-id"] = cid;       // Propagate
  logger.debug(`Outgoing request ${config.method} ${config.url} - cid:${cid}`);
  return config;
});

axiosInstance.interceptors.response.use(
  (res) => res,
  (err) => {
    logger.error(`Outgoing request failed: ${err.message} - cid:${getCorrelationId()}`);
    return Promise.reject(err);
  }
);
```

### 3. Test Correlation ID Helper (`test_api.js`)

```javascript
const CORRELATION_ID = `test-${Date.now()}`;
function withCorr(headers = {}) {
  return { ...headers, "x-correlation-id": CORRELATION_ID };
}
// Use: headers: withCorr({ "Content-Type": "application/json" })
```

---

## License

Part of the SMS Microservices Project.
