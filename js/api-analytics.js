// api-analytics.js - Analytics API adapter
// Version: 1.0.0
// Date: 2024-01-02
// Adapter for analytics functionality, re-exports from api.core.js

import {
    secureApiFetch,
    getAnalyticsData,
    exportAnalytics,
    formatTimeAgo,
    debounce,
    throttle,
    apiCallWithRetry
} from "./api.core.js";

// Re-export core analytics functions
export {
    getAnalyticsData,
    exportAnalytics,
    formatTimeAgo
};

// Enhanced analytics functions with safe fallbacks
export async function getDashboardStats() {
    try {
        // Try to get comprehensive dashboard stats
        const response = await secureApiFetch('/api/analytics/dashboard', {
            method: 'GET'
        });
        
        if (response.success) {
            return response;
        }
        
        // Fallback: Get basic stats
        console.warn('⚠️ [ANALYTICS] Dashboard endpoint failed, using basic stats');
        return await getAnalyticsData({ type: 'basic' });
    } catch (error) {
        console.error('❌ [ANALYTICS] Dashboard stats error:', error);
        return {
            success: false,
            message: 'Failed to load dashboard statistics',
            offline: true,
            data: {
                totalUsers: 0,
                activeChats: 0,
                messagesToday: 0,
                uptime: '0%'
            }
        };
    }
}

export async function getUserAnalytics(userId) {
    try {
        return await secureApiFetch(`/api/analytics/users/${userId}`, {
            method: 'GET'
        });
    } catch (error) {
        console.error('❌ [ANALYTICS] User analytics error:', error);
        return {
            success: false,
            message: 'Failed to load user analytics',
            data: {}
        };
    }
}

export async function getChatAnalytics(chatId, timeframe = '7d') {
    try {
        return await secureApiFetch(`/api/analytics/chats/${chatId}?timeframe=${timeframe}`, {
            method: 'GET'
        });
    } catch (error) {
        console.error('❌ [ANALYTICS] Chat analytics error:', error);
        return {
            success: false,
            message: 'Failed to load chat analytics',
            data: {
                messagesPerDay: [],
                activeHours: [],
                engagement: 0
            }
        };
    }
}

export async function trackEvent(eventName, eventData = {}) {
    try {
        // Debounced tracking to prevent spam
        const debouncedTrack = debounce(async () => {
            await secureApiFetch('/api/analytics/events', {
                method: 'POST',
                body: {
                    name: eventName,
                    data: eventData,
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    platform: navigator.platform
                }
            });
        }, 1000);
        
        await debouncedTrack();
        return { success: true, message: 'Event tracked' };
    } catch (error) {
        console.warn('⚠️ [ANALYTICS] Event tracking failed:', error);
        // Silent fail for analytics - don't break UX
        return { success: false, message: 'Event tracking failed' };
    }
}

export async function getPerformanceMetrics() {
    try {
        return await secureApiFetch('/api/analytics/performance', {
            method: 'GET'
        });
    } catch (error) {
        console.error('❌ [ANALYTICS] Performance metrics error:', error);
        return {
            success: false,
            message: 'Failed to load performance metrics',
            data: {
                apiResponseTime: 0,
                pageLoadTime: 0,
                websocketLatency: 0,
                errors: []
            }
        };
    }
}

export async function getSystemHealth() {
    try {
        return await secureApiFetch('/api/analytics/health', {
            method: 'GET'
        });
    } catch (error) {
        console.error('❌ [ANALYTICS] System health error:', error);
        return {
            success: false,
            message: 'Failed to load system health',
            data: {
                backend: 'unknown',
                database: 'unknown',
                cache: 'unknown',
                websocket: 'unknown'
            }
        };
    }
}

// Real-time analytics subscription
export function subscribeToAnalytics(callback) {
    try {
        // Simulate real-time updates (in a real app, would use WebSocket)
        const interval = setInterval(async () => {
            try {
                const stats = await getAnalyticsData({ realtime: true });
                if (stats.success) {
                    callback(stats.data);
                }
            } catch (error) {
                console.warn('⚠️ [ANALYTICS] Real-time update failed:', error);
            }
        }, 30000); // Update every 30 seconds
        
        return () => clearInterval(interval);
    } catch (error) {
        console.error('❌ [ANALYTICS] Subscription error:', error);
        return () => {}; // No-op cleanup
    }
}

console.log("✅ api-analytics.js loaded");