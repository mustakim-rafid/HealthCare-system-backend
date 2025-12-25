import express from 'express';
import { MetaController } from './meta.controller';
import { checkAuth } from '../../middlewares/CheckAuth';
import { Role } from '@prisma/client';

const router = express.Router();

router.get(
    '/',
    checkAuth(Role.ADMIN, Role.DOCTOR, Role.PATIENT),
    MetaController.fetchDashboardMetaData
)


export const MetaRoutes = router;