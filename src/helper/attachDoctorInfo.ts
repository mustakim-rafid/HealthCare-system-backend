import { prisma } from "../utils/prisma";

type AiDoctorSuggestion = {
  suggestedDoctor: string;
  specialization: string;
  reason: string;
  rating: string;
};

export async function attachDoctorInfo(
  jsonResponse: AiDoctorSuggestion[]
) {
  // 1. Extract doctor names
  const doctorNames = jsonResponse.map(
    (item) => item.suggestedDoctor
  );

  // 2. Fetch all doctors in ONE query
  const doctors = await prisma.doctor.findMany({
    where: {
      name: {
        in: doctorNames,
      },
    },
    include: {
      doctorSchedule: {
        include: {
          schedule: true,
        }
      }
    }
  });

  // 3. Map doctors by name for fast lookup
  const doctorMap = new Map(
    doctors.map((doc: any) => [doc.name, doc])
  );

  // 4. Attach doctor info to each AI item
  const enrichedResponse = jsonResponse.map((item) => ({
    ...item,
    doctorInfo: doctorMap.get(item.suggestedDoctor) ?? null,
  }));

  return enrichedResponse;
}
