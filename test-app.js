"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata"); // Required for tsyringe
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http")); // Import http module
const socket_io_1 = require("socket.io"); // Import Socket.IO
const dotenv_1 = __importDefault(require("dotenv"));
const database_1 = require("./config/database");
const tsyringe_1 = require("tsyringe");
const errorHandler_1 = require("./middleware/errorHandler");
const authMiddleware_1 = require("./middleware/authMiddleware");
// Import services directly to register them
const EmailService_1 = require("./services/EmailService");
const SnsService_1 = require("./services/SnsService");
const S3Service_1 = require("./services/S3Service");
const RedisService_1 = require("./services/RedisService");
const ChatService_1 = require("./services/ChatService");
const NotificationService_1 = require("./services/NotificationService");
const SocketService_1 = require("./services/SocketService");
// Initialize global express app and server
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: ["https://admin.socket.io", "http://localhost:8080", "http://localhost:3000"],
        credentials: true
    }
});
// Register services
tsyringe_1.container.registerSingleton(EmailService_1.EmailService);
tsyringe_1.container.registerSingleton(RedisService_1.RedisService);
tsyringe_1.container.registerSingleton(SnsService_1.SnsService);
tsyringe_1.container.registerSingleton(SocketService_1.SocketService);
tsyringe_1.container.registerSingleton(NotificationService_1.NotificationService);
// Initialize Socket.IO first
const socketService = tsyringe_1.container.resolve(SocketService_1.SocketService);
socketService.setSocketServer(io);
// NOW import routes - after Socket.IO is initialized
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const activityRoutes_1 = __importDefault(require("./routes/activityRoutes"));
const postRoutes_1 = __importDefault(require("./routes/postRoutes"));
const likeRoutes_1 = __importDefault(require("./routes/likeRoutes"));
const commentRoutes_1 = __importDefault(require("./routes/commentRoutes"));
const userPhoneRoutes_1 = __importDefault(require("./routes/userPhoneRoutes"));
const cityRoutes_1 = __importDefault(require("./routes/cityRoutes"));
const placeRoutes_1 = __importDefault(require("./routes/placeRoutes"));
const eventGroupRoutes_1 = __importDefault(require("./routes/eventGroupRoutes"));
dotenv_1.default.config();
class App {
    constructor() {
        // Use the global instances
        this.app = app;
        this.server = server;
        this.io = io;
        // Get service references
        this.socketService = socketService;
        this.emailService = tsyringe_1.container.resolve(EmailService_1.EmailService);
        this.snsService = tsyringe_1.container.resolve(SnsService_1.SnsService);
        this.s3Service = new S3Service_1.S3Service();
        this.redisService = tsyringe_1.container.resolve(RedisService_1.RedisService);
        this.notificationService = tsyringe_1.container.resolve(NotificationService_1.NotificationService);
        this.chatService = new ChatService_1.ChatService(this.io);
        this.initializeMiddlewares();
        this.initializeRoutes();
        this.initializeConnections();
    }
    initializeMiddlewares() {
        this.app.use(express_1.default.json());
        // Add API logging middleware
        this.app.use((req, res, next) => {
            const start = Date.now();
            // Log request
            console.group(`📨 ${req.method} ${req.url}`);
            if (Object.keys(req.query).length > 0) {
                console.log('Query:', req.query);
            }
            if (Object.keys(req.body).length > 0) {
                console.log('Body:', req.body);
            }
            // Capture and log response
            const originalSend = res.send;
            res.send = function (data) {
                const responseTime = Date.now() - start;
                console.log(`response: ${res.statusCode} - ${responseTime}ms`);
                console.groupEnd();
                return originalSend.call(this, data);
            };
            next();
        });
    }
    initializeRoutes() {
        //TODO group route with prefix /api
        //temp token for register and login access token for other routes
        //will be handled in routes and middleware
        this.app.use('/api/auth', authRoutes_1.default);
        this.app.use("/api/posts", authMiddleware_1.authenticate, postRoutes_1.default);
        this.app.use("/api/users", authMiddleware_1.authenticate, userRoutes_1.default);
        this.app.use("/api/activities", activityRoutes_1.default);
        this.app.use("/api/posts", [postRoutes_1.default, likeRoutes_1.default, commentRoutes_1.default]);
        this.app.use("/api/eventGroups", eventGroupRoutes_1.default);
        this.app.use('/api/userPhones', userPhoneRoutes_1.default);
        this.app.use('/api/cities', cityRoutes_1.default);
        this.app.use('/api/places', placeRoutes_1.default);
        this.initializeHealthCheck();
        // Error handling middleware should be last
        this.app.use(errorHandler_1.errorHandler);
    }
    initializeConnections() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Initialize database
                yield (0, database_1.connectDB)();
                console.log("✅ Database connection established");
                // Verify email connection
                const emailConnected = yield this.emailService.verifyConnection();
                if (emailConnected) {
                    console.log("✅ Email service connected");
                }
                else {
                    console.error("❌ Email service connection failed");
                }
                // Check Redis connection
                const redisConnected = yield this.redisService.verifyConnection();
                if (redisConnected) {
                    console.log("✅ Redis connection established");
                }
                else {
                    console.error("❌ Redis connection failed");
                }
                // Check SNS service
                const snsConnected = yield this.snsService.verifyConnection();
                if (snsConnected) {
                    console.log("✅ SNS service connected");
                }
                else {
                    console.error("❌ SNS service connection failed");
                }
                // Verify S3 connection
                const s3Connected = yield this.s3Service.verifyConnection();
                if (s3Connected) {
                    console.log("✅ S3 connection established");
                }
                else {
                    console.error("❌ S3 connection failed");
                }
                // Verify Socket service
                if (this.socketService) {
                    console.log("✅ Socket service initialized");
                }
                else {
                    console.error("❌ Socket service initialization failed");
                }
                // Verify Chat service
                if (this.chatService) {
                    console.log("✅ Chat service initialized");
                }
                else {
                    console.error("❌ Chat service initialization failed");
                }
                // Start server
                const PORT = process.env.PORT || 3000;
                this.server.listen(PORT, () => {
                    console.log(`✅ Server running on port ${PORT}`);
                });
            }
            catch (error) {
                console.error("❌ Error during initialization:", error);
                process.exit(1);
            }
        });
    }
    // use for loading page in the app
    initializeHealthCheck() {
        this.app.get('/health', (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                // Check database connection
                const dbConnected = database_1.AppDataSource.isInitialized;
                // Check email service
                const emailConnected = yield this.emailService.verifyConnection();
                // Check phone service
                const snsConnected = yield this.snsService.verifyConnection();
                // Check S3 connection
                const s3Connected = yield this.s3Service.verifyConnection();
                // Check Socket, Notification, and Chat services
                const socketConnected = !!this.socketService;
                const chatConnected = !!this.chatService;
                res.json({
                    status: 'ok',
                    database: dbConnected ? 'connected' : 'disconnected',
                    email: emailConnected ? 'connected' : 'disconnected',
                    sns: snsConnected ? 'connected' : 'disconnected',
                    s3: s3Connected ? 'connected' : 'disconnected',
                    socket: socketConnected ? 'connected' : 'disconnected',
                    chat: chatConnected ? 'connected' : 'disconnected',
                    timestamp: new Date().toISOString()
                });
            }
            catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: 'Health check failed',
                    timestamp: new Date().toISOString()
                });
            }
        }));
    }
}
// Create and export app instance
const appInstance = new App();
exports.default = appInstance.app;
//# sourceMappingURL=app.js.map