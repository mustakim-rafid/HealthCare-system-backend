import { Gender } from "@prisma/client";

export interface IUpdateDoctorPayload {
    name?: string;
    contactNumber?: string | null | undefined;
    address?: string | null | undefined;
    experience?: number | undefined;
    gender?: Gender;
    appointmentFee?: number;
    qualification?: string;
    currentWorkingPlace?: string;
    designation?: string;
    specialities?: {
      specialityId: string;
      deleteFlag?: boolean;
    }[];
}