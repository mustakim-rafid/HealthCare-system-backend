# 🏥 AI-Powered Healthcare Management System (Backend)

A full-featured **Healthcare Management System backend** that connects **Patients**, **Doctors**, and **Admins** on a single platform.  
Patients can search doctors, book **video consultation appointments**, receive **electronic prescriptions**, make payments, and recover with ease — all powered by modern backend architecture and **AI-driven doctor recommendations**.

---

## 🚀 Project Overview

This system is designed to simplify healthcare access through **digital consultation workflows**, ensuring:

- Faster doctor discovery
- Seamless appointment scheduling
- Secure role-based access
- Real-time consultation readiness
- Digital prescriptions and reviews

---

## 🧭 Core Consultation Flow

**Easy Steps to Get Your Solution**

1. 🔍 **Search Doctor** – Find doctors easily with minimal effort  
2. 👨‍⚕️ **Check Doctor Profile** – View doctor details, specialties, and schedules  
3. 📅 **Schedule Appointment** – Choose preferred date & time  
4. 💬 **Instant Video Consultation** – Consult from anywhere  
5. 📄 **Electronic Prescription** – Receive prescriptions digitally  
6. 💳 **Easy Payment Options** – Pay now or later  
7. 💊 **Health Recovery** – Start your journey to better health  

---

## 👥 User Roles

| Role    | Capabilities |
|--------|--------------|
| **Admin** | Manage users, schedules, specialities, analytics |
| **Doctor** | Manage profile, schedules, appointments, prescriptions |
| **Patient** | Book appointments, consult doctors, payments, reviews |

---

## ✨ Key Features

### 🔐 Authentication & Authorization
- JWT-based authentication
- Login, refresh token, get logged-in user
- Role-based route protection (Admin, Doctor, Patient)
- Secure password change

---

### 👤 User Management
- Create **Admin**, **Doctor**, and **Patient** accounts
- Profile image upload
- Update profile information
- Admin-only user listing
- Secure profile access

---

### 🧠 AI-Driven Doctor Suggestion
- AI analyzes patient symptoms
- Suggests best-matched doctors
- Enhances faster and accurate consultations

---

### 👨‍⚕️ Doctor Management
- View doctor profiles
- Update doctor information
- Soft delete & permanent delete
- Assign doctor specialities
- Doctor availability schedules

---

### 📅 Appointment Management
- Patients can:
  - Book appointments
  - Choose **pay now** or **pay later**
- Doctors can:
  - Update appointment status
- Admin / Doctor / Patient:
  - View appointment history
- Personal appointment tracking

---

### ⏰ Doctor Schedule Management
- Doctors create availability schedules
- View personal schedules
- Admin manages all schedules
- Patients can view doctor availability

---

### 📄 Prescription System
- Doctors create electronic prescriptions
- Patients can view their prescriptions
- Admin can view all prescriptions

---

### ⭐ Review & Rating System
- Patients submit doctor reviews
- Public review listing
- Helps improve healthcare quality

---

### 📊 Dashboard & Meta Analytics
- Centralized dashboard metrics
- Role-based analytics (Admin, Doctor, Patient)

---

## 🧪 API Endpoints

**Base URL:** `/api/v1`

---

## 🔐 Auth Routes (`/api/v1/auth`)

| Method | Endpoint | Description | Access |
|------|---------|-------------|--------|
| POST | `/login` | Login user | Public |
| GET | `/getme` | Get logged-in user | Auth |
| POST | `/refresh-token` | Refresh token | Public |
| PATCH | `/change-password` | Change password | Admin, Doctor, Patient |

---

## 👤 User Routes (`/api/v1/user`)

| Method | Endpoint | Description | Access |
|------|---------|-------------|--------|
| GET | `/` | Get all users | Admin |
| POST | `/create-admin` | Create admin | Admin |
| POST | `/create-doctor` | Create doctor | Admin |
| POST | `/create-patient` | Register patient | Public |
| GET | `/profile-data` | Get profile info | Auth |
| PATCH | `/update-my-profile` | Update profile | Auth |

---

## 👨‍⚕️ Doctor Routes (`/api/v1/doctor`)

| Method | Endpoint | Description | Access |
|------|---------|-------------|--------|
| GET | `/` | Get all doctors | Public |
| GET | `/:id` | Get doctor by ID | Public |
| PATCH | `/:id` | Update doctor | Admin, Doctor |
| DELETE | `/:id` | Delete doctor | Admin |
| DELETE | `/soft-delete/:id` | Soft delete doctor | Admin |
| POST | `/suggestion` | AI doctor suggestion | Public |

---

## 📅 Doctor Schedule Routes (`/api/v1/doctor-schedule`)

| Method | Endpoint | Description | Access |
|------|---------|-------------|--------|
| POST | `/` | Create schedule | Doctor |
| GET | `/` | Get all schedules | Admin, Doctor, Patient |
| GET | `/my-schedule` | Get my schedule | Doctor |
| DELETE | `/:id` | Delete schedule | Doctor |

---

## 📘 Appointment Routes (`/api/v1/appointment`)

| Method | Endpoint | Description | Access |
|------|---------|-------------|--------|
| POST | `/` | Create appointment | Patient |
| GET | `/` | Get all appointments | Admin, Doctor, Patient |
| PATCH | `/:id/update-status` | Update status | Doctor |
| GET | `/my-appointment` | My appointments | Patient, Doctor |
| POST | `/pay-later` | Create pay-later appointment | Patient |

---

## 📄 Prescription Routes (`/api/v1/prescription`)

| Method | Endpoint | Description | Access |
|------|---------|-------------|--------|
| POST | `/` | Create prescription | Doctor |
| GET | `/` | Get all prescriptions | Admin |
| GET | `/my-prescription` | Patient prescriptions | Patient |

---

## ⭐ Review Routes (`/api/v1/review`)

| Method | Endpoint | Description | Access |
|------|---------|-------------|--------|
| POST | `/` | Create review | Patient |
| GET | `/` | Get all reviews | Public |

---

## 🩺 Speciality Routes (`/api/v1/speciality`)

| Method | Endpoint | Description | Access |
|------|---------|-------------|--------|
| GET | `/` | Get all specialities | Public |
| POST | `/` | Create speciality | Admin |
| DELETE | `/:id` | Delete speciality | Admin |

---

## 📊 Meta Routes (`/api/v1/meta`)

| Method | Endpoint | Description | Access |
|------|---------|-------------|--------|
| GET | `/` | Dashboard metadata | Admin, Doctor, Patient |

---

## 🛠️ Tech Stack

- **TypeScript**
- **Node.js**
- **Express.js**
- **PostgreSQL**
- **Prisma ORM**
- **JWT Authentication**
- **Zod Validation**
- **Cloudinary (File Upload)**
- **Role-Based Access Control**

---

## ⚙️ Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/mustakim-rafid/HealthCare-system-backend.git
cd HealthCare-system-backend
```

### 2. Create `.env` file in the root directory

```env
PORT=
NODE_ENV=development

# Database
DATABASE_URL=database-url

# Cloudinary
CLOUDINARY_CLOUD_NAME=cloudinary-cloud-name
CLOUDINARY_API_KEY=cloudinary-api-key
CLOUDINARY_API_SECRET=cloudinary-api-secret

# bcrypt
BCRYPT_SALT_ROUND=

# JWT
ACCESS_TOKEN_SECRET=access-token-secret
ACCESS_TOKEN_EXPIRY=
REFRESH_TOKEN_SECRET=refresh-token-secret
REFRESH_TOKEN_EXPIRY=

# Super admin

SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=

# Frontend url
FRONTEND_URL=frontend-url
```

### 3. Install dependencies and also configure prisma from documentation

```bash
npm install
```

### 4. Start the local server

```bash
npm run dev
```

### 6. Test with Postman or any API testing tool

---

## Thanks.
