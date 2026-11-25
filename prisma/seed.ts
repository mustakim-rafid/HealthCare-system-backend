/**
 * Idempotent demo seed — safe to run any number of times (upserts / "create if missing" only,
 * never deletes or overwrites existing data, never resets an existing user's password).
 *
 *   npm run seed
 *
 * Credentials come from env vars. The admin is created only when SUPER_ADMIN_EMAIL and
 * SUPER_ADMIN_PASSWORD are set (no admin credentials are hard-coded). Demo doctor/patient defaults:
 *   DEMO_DOCTOR_EMAIL / DEMO_DOCTOR_PASSWORD   (default doctor@healthcare.dev / Doctor@12345)
 *   DEMO_PATIENT_EMAIL / DEMO_PATIENT_PASSWORD (default patient@healthcare.dev / Patient@12345)
 *   SEED_DEMO_DATA=false  → only the admin is created
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();
const rounds = Number(process.env.BCRYPT_SALT_ROUND || 10);

const admin = {
  email: process.env.SUPER_ADMIN_EMAIL,
  password: process.env.SUPER_ADMIN_PASSWORD,
};
const doctor = {
  email: process.env.DEMO_DOCTOR_EMAIL || "doctor@healthcare.dev",
  password: process.env.DEMO_DOCTOR_PASSWORD || "Doctor@12345",
};
const patient = {
  email: process.env.DEMO_PATIENT_EMAIL || "patient@healthcare.dev",
  password: process.env.DEMO_PATIENT_PASSWORD || "Patient@12345",
};

const ensureUser = async (email: string, password: string, role: Role) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { created: false };
  await prisma.user.create({
    data: { email, role, password: await bcrypt.hash(password, rounds), needChangePassword: false },
  });
  return { created: true };
};

async function main() {
  // Admin (only from env vars)
  if (admin.email && admin.password) {
    const a = await ensureUser(admin.email, admin.password, Role.ADMIN);
    await prisma.admin.upsert({ where: { email: admin.email }, update: {}, create: { email: admin.email, name: "Super admin" } });
    console.log(`admin   ${a.created ? "created" : "exists, unchanged"}`);
  } else {
    console.log("admin   skipped (set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD)");
  }

  if (process.env.SEED_DEMO_DATA === "false") return;

  // Specialities
  const specialityTitles = ["Cardiology", "Dermatology", "General Medicine", "Pediatrics", "Neurology"];
  const specialities = [];
  for (const title of specialityTitles) {
    const found = await prisma.speciality.findFirst({ where: { title } });
    specialities.push(found ?? (await prisma.speciality.create({ data: { title, icon: "" } })));
  }

  // Doctor
  const d = await ensureUser(doctor.email, doctor.password, Role.DOCTOR);
  const doctorProfile = await prisma.doctor.upsert({
    where: { email: doctor.email },
    update: {},
    create: {
      email: doctor.email,
      name: "Dr. Ayesha Rahman",
      registrationNumber: "BMDC-DEMO-001",
      experience: 8,
      gender: "FEMALE",
      appointmentFee: 500,
      qualification: "MBBS, FCPS (Medicine)",
      currentWorkingPlace: "City General Hospital",
      designation: "Consultant Physician",
      contactNumber: "+8801700000000",
    },
  });
  for (const s of specialities.slice(0, 2)) {
    await prisma.doctorSpeciality.upsert({
      where: { specialityId_doctorId: { specialityId: s.id, doctorId: doctorProfile.id } },
      update: {},
      create: { specialityId: s.id, doctorId: doctorProfile.id },
    });
  }
  console.log(`doctor  ${doctor.email} ${d.created ? "(created)" : "(exists, unchanged)"}`);

  // Patient
  const p = await ensureUser(patient.email, patient.password, Role.PATIENT);
  await prisma.paitent.upsert({
    where: { email: patient.email },
    update: {},
    create: { email: patient.email, name: "Rahim Uddin", contactNumber: "+8801800000000", address: "Dhaka" },
  });
  console.log(`patient ${patient.email} ${p.created ? "(created)" : "(exists, unchanged)"}`);

  // Slots: next 7 days, 03:00–07:00 UTC (09:00–13:00 Asia/Dhaka), 30 minutes each.
  // The doctor offers every other slot so there is something left to pick in the doctor dashboard.
  const now = Date.now();
  const today = new Date();
  let createdSlots = 0;
  let offered = 0;
  for (let day = 0; day < 7; day++) {
    for (let m = 3 * 60; m < 7 * 60; m += 30) {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + day, 0, m));
      if (start.getTime() <= now) continue;
      const end = new Date(start.getTime() + 30 * 60_000);
      let slot = await prisma.schedule.findFirst({ where: { startDateTime: start, endDateTime: end, isDeleted: false } });
      if (!slot) {
        slot = await prisma.schedule.create({ data: { startDateTime: start, endDateTime: end } });
        createdSlots++;
      }
      if ((m / 30) % 2 === 0) {
        const r = await prisma.doctorSchedule.createMany({
          data: [{ scheduleId: slot.id, doctorId: doctorProfile.id }],
          skipDuplicates: true,
        });
        offered += r.count;
      }
    }
  }
  console.log(`slots   ${createdSlots} created, ${offered} newly offered by the demo doctor`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
