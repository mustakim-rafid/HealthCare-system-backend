import { TxClient } from "../../utils/prisma";

/**
 * Atomic compare-and-set on the doctor slot: only one concurrent request can flip
 * isBooked false -> true (Postgres row lock), so a slot can never be double booked.
 */
export const claimSlot = async (tx: TxClient, doctorId: string, scheduleId: string) => {
  const res = await tx.doctorSchedule.updateMany({
    where: { doctorId, scheduleId, isBooked: false },
    data: { isBooked: true },
  });
  return res.count === 1;
};

export const releaseSlot = async (tx: TxClient, doctorId: string, scheduleId: string) => {
  await tx.doctorSchedule.updateMany({ where: { doctorId, scheduleId }, data: { isBooked: false } });
};
