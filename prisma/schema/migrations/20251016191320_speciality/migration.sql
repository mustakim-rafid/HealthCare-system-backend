-- CreateTable
CREATE TABLE "specialities" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL,

    CONSTRAINT "specialities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_specialities" (
    "specialityId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,

    CONSTRAINT "doctor_specialities_pkey" PRIMARY KEY ("specialityId","doctorId")
);

-- AddForeignKey
ALTER TABLE "doctor_specialities" ADD CONSTRAINT "doctor_specialities_specialityId_fkey" FOREIGN KEY ("specialityId") REFERENCES "specialities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_specialities" ADD CONSTRAINT "doctor_specialities_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
