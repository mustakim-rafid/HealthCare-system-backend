import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import globalErrorHandler from './middlewares/globalErrorHandler';
import notFound from './middlewares/notFound';
import router from './routes';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import { paymentController } from './module/payment/payment.controller';

const app: Application = express();
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

// app.post(
//   "/api/v1/webhook",
//   bodyParser.raw({ type: "application/json" }),
//   paymentController.paymentVerification
// )

//parser
app.use(express.json());
app.use(cookieParser())
app.use(express.urlencoded({ extended: true }));

app.get('/', (req: Request, res: Response) => {
    res.send({
        Message: "Ph health care server",
        runningTime: `${Math.floor(process.uptime())} seconds`,
        time: new Date().toLocaleString()        
    })
});

app.use("/api/v1", router)

app.use(globalErrorHandler);

app.use(notFound);

export default app;