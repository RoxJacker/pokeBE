import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createUser, sanitizeUser } from './store.js';

dotenv.config();

console.log("Starting test...");
try {
  console.log("URI:", process.env.MONGODB_URI)
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const email = 'test' + Date.now() + '@test.com';
  console.log("Creating user:", email);
  const user = await createUser({ username: 'TestUser', email, password: 'password123' });
  console.log("User created, calling sanitizeUser...");
  
  const sanitized = await sanitizeUser(user);
  console.log("Sanitized successfully:", !!sanitized);
} catch (e) {
  console.error("\n--- ERROR CAUGHT ---");
  console.error(e);
} finally {
  await mongoose.disconnect();
}
