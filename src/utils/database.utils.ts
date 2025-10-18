import mongoose from "mongoose";

export const isConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

export const getConnectionStatus = (): string => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  return states[mongoose.connection.readyState] || "unknown";
};

export const closeConnection = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    console.log("MongoDB connection closed gracefully");
  } catch (error) {
    console.error("Error closing MongoDB connection:", error);
    throw error;
  }
};

export const getDatabaseStats = async () => {
  if (!isConnected()) {
    throw new Error("Database not connected");
  }

  try {
    const db = mongoose.connection.db;
    const stats = await db?.stats();
    return {
      database: mongoose.connection.name,
      collections: stats?.collections || 0,
      dataSize: stats?.dataSize || 0,
      indexSize: stats?.indexSize || 0,
      storageSize: stats?.storageSize || 0,
    };
  } catch (error) {
    console.error("Error getting database stats:", error);
    throw error;
  }
};

export const testConnection = async (): Promise<boolean> => {
  try {
    if (!isConnected()) {
      return false;
    }
    await mongoose.connection.db?.admin().ping();
    return true;
  } catch (error) {
    console.error("Database connection test failed:", error);
    return false;
  }
};

