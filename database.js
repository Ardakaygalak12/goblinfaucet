const DATABASE = {
    config: {
        binId: '67b0a195ad19ca34f804ba90',
        apiKey: '$2a$10$m3ykh1NKxmtQDVM140H6TOTqsemkiBEdfdQnG/ApyhjJ1Duj2Ri6W',
        adminSettings: {
            ptcAdLimits: {
                minDuration: 10,
                maxDuration: 180
            },
            systemSettings: {
                minWithdrawAmount: 1000,
                airdropStatus: 'active',
                maintenanceMode: false,
                maxDailyEarnings: 5000,
                referralBonus: 1000
            },
            securitySettings: {
                maxFailedAttempts: 3,
                blockDuration: 24, // hours
                requireCaptcha: true,
                fraudDetectionEnabled: true
            }
        }
    },

    api: {
        baseUrl: 'https://api.jsonbin.io/v3/b',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': '$2a$10$m3ykh1NKxmtQDVM140H6TOTqsemkiBEdfdQnG/ApyhjJ1Duj2Ri6W',
            'X-Bin-Meta': false
        },

        async getAllData() {
            try {
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}/latest`, {
                    headers: this.headers
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                return data.record || this.getDefaultData();
            } catch (error) {
                console.error('Data fetch error:', error);
                return this.getDefaultData();
            }
        },

        getDefaultData() {
            return {
                users: {},
                shortlinks: [],
                ptcAds: [],
                tasks: [],
                adminLogs: [],
                reports: [],
                fraudDetection: {
                    suspiciousIPs: [],
                    blockedUsers: [],
                    activityLogs: []
                },
                statistics: {
                    global: {
                        totalUsers: 0,
                        totalBonk: 0,
                        activeUsers: 0
                    },
                    daily: {},
                    earnings: {}
                }
            };
        },

        async updateData(data) {
            try {
                const response = await fetch(`${this.baseUrl}/${DATABASE.config.binId}`, {
                    method: 'PUT',
                    headers: this.headers,
                    body: JSON.stringify(data)
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                console.error('Data update error:', error);
                return null;
            }
        }
    },

    admin: {
        async logAction(adminId, action, details) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.adminLogs) data.adminLogs = [];

                const logEntry = {
                    id: Date.now().toString(),
                    adminId,
                    action,
                    details,
                    timestamp: new Date().toISOString(),
                    ipAddress: details.ipAddress || 'unknown',
                    userAgent: details.userAgent || 'unknown',
                    success: details.success !== false
                };

                data.adminLogs.push(logEntry);
                if (data.adminLogs.length > 1000) {
                    data.adminLogs = data.adminLogs.slice(-1000);
                }

                await DATABASE.api.updateData(data);
                return logEntry;
            } catch (error) {
                console.error('Admin log error:', error);
                return null;
            }
        },

        async getActionLogs(filters = {}) {
            try {
                const data = await DATABASE.api.getAllData();
                let logs = data.adminLogs || [];

                if (filters.adminId) {
                    logs = logs.filter(log => log.adminId === filters.adminId);
                }
                if (filters.action) {
                    logs = logs.filter(log => log.action === filters.action);
                }
                if (filters.dateRange) {
                    logs = logs.filter(log => {
                        const logDate = new Date(log.timestamp);
                        return logDate >= filters.dateRange.start && 
                               logDate <= filters.dateRange.end;
                    });
                }
                if (filters.success !== undefined) {
                    logs = logs.filter(log => log.success === filters.success);
                }

                return logs.sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp));
            } catch (error) {
                console.error('Action logs fetch error:', error);
                return [];
            }
        }
    },

    contentManagement: {
        async createShortlink(adminId, shortlinkData) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.shortlinks) data.shortlinks = [];

                const newShortlink = {
                    id: Date.now().toString(),
                    title: shortlinkData.title,
                    url: shortlinkData.url,
                    bonkReward: parseInt(shortlinkData.bonkReward),
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    createdBy: adminId,
                    settings: {
                        expirationDate: shortlinkData.expirationDate || null,
                        geoRestrictions: shortlinkData.geoRestrictions || [],
                        requireCaptcha: shortlinkData.requireCaptcha || false,
                        mobileSupport: {
                            allowed: shortlinkData.mobileSupport?.allowed !== false,
                            platforms: shortlinkData.mobileSupport?.platforms || ['android', 'ios']
                        },
                        customRedirectDelay: shortlinkData.customRedirectDelay || 0,
                        vpnBlocked: shortlinkData.vpnBlocked || false
                    },
                    stats: {
                        totalClicks: 0,
                        uniqueClicks: 0,
                        bonkPaid: 0,
                        completionRate: 0,
                        failedAttempts: 0,
                        averageCompletionTime: 0,
                        deviceStats: {
                            desktop: 0,
                            mobile: 0,
                            tablet: 0
                        },
                        dailyStats: {}
                    }
                };

                data.shortlinks.push(newShortlink);
                await DATABASE.api.updateData(data);
                await DATABASE.admin.logAction(adminId, 'shortlink_created', {
                    shortlinkId: newShortlink.id,
                    title: shortlinkData.title,
                    settings: newShortlink.settings
                });

                return newShortlink;
            } catch (error) {
                console.error('Shortlink creation error:', error);
                return null;
            }
        },

        async createPtcAd(adminId, adData) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.ptcAds) data.ptcAds = [];

                // Validate view duration
                const viewDuration = parseInt(adData.viewDuration) || 15;
                if (viewDuration < DATABASE.config.adminSettings.ptcAdLimits.minDuration || 
                    viewDuration > DATABASE.config.adminSettings.ptcAdLimits.maxDuration) {
                    throw new Error(`View duration must be between ${DATABASE.config.adminSettings.ptcAdLimits.minDuration} and ${DATABASE.config.adminSettings.ptcAdLimits.maxDuration} seconds`);
                }

                const newAd = {
                    id: Date.now().toString(),
                    title: adData.title,
                    url: adData.url,
                    bonkReward: parseInt(adData.bonkReward),
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    createdBy: adminId,
                    settings: {
                        viewDuration: viewDuration,
                        dailyLimit: parseInt(adData.dailyLimit) || 15,
                        requireFocus: adData.requireFocus !== false,
                        expirationDate: adData.expirationDate || null,
                        geoTargeting: adData.geoTargeting || [],
                        scheduleSettings: {
                            startDate: adData.scheduleSettings?.startDate || null,
                            endDate: adData.scheduleSettings?.endDate || null,
                            dailyStartTime: adData.scheduleSettings?.dailyStartTime || null,
                            dailyEndTime: adData.scheduleSettings?.dailyEndTime || null
                        },
                        mobileSupport: {
                            allowed: adData.mobileSupport?.allowed !== false,
                            platforms: adData.mobileSupport?.platforms || ['android', 'ios']
                        },
                        vpnBlocked: adData.vpnBlocked || false,
                        customBrowser: adData.customBrowser || null
                    },
                    fraudPrevention: {
                        maxAttemptsPerIP: adData.fraudPrevention?.maxAttemptsPerIP || 5,
                        requireCaptcha: adData.fraudPrevention?.requireCaptcha || false,
                        blockProxy: adData.fraudPrevention?.blockProxy || true
                    },
                    stats: {
                        totalViews: 0,
                        uniqueViews: 0,
                        bonkPaid: 0,
                        completionRate: 0,
                        failedAttempts: 0,
                        averageViewTime: 0,
                        deviceStats: {
                            desktop: 0,
                            mobile: 0,
                            tablet: 0
                        },
                        dailyStats: {},
                        revenueStats: {
                            daily: {},
                            total: 0
                        }
                    }
                };

                data.ptcAds.push(newAd);
                await DATABASE.api.updateData(data);
                await DATABASE.admin.logAction(adminId, 'ptc_ad_created', {
                    adId: newAd.id,
                    title: adData.title,
                    settings: newAd.settings
                });

                return newAd;
            } catch (error) {
                console.error('PTC ad creation error:', error);
                return null;
            }
        },

        async updateContentStatus(adminId, contentType, contentId, updates) {
            try {
                const data = await DATABASE.api.getAllData();
                const contentArray = data[contentType];
                const index = contentArray.findIndex(item => item.id === contentId);

                if (index === -1) throw new Error(`${contentType} not found`);

                const oldStatus = contentArray[index].status;
                const updatedContent = {
                    ...contentArray[index],
                    status: updates.status || oldStatus,
                    settings: {
                        ...contentArray[index].settings,
                        ...updates.settings
                    },
                    lastUpdated: {
                        timestamp: new Date().toISOString(),
                        updatedBy: adminId,
                        changes: {
                            oldStatus,
                            newStatus: updates.status,
                            updatedSettings: updates.settings
                        }
                    }
                };

                contentArray[index] = updatedContent;
                await DATABASE.api.updateData(data);
                await DATABASE.admin.logAction(adminId, `${contentType}_updated`, {
                    contentId,
                    changes: updatedContent.lastUpdated.changes
                });

                return updatedContent;
            } catch (error) {
                console.error('Content update error:', error);
                return null;
            }
        },

        async getContentAnalytics(contentType, contentId, dateRange = null) {
            try {
                const data = await DATABASE.api.getAllData();
                const content = data[contentType].find(item => item.id === contentId);
                
                if (!content) throw new Error(`${contentType} not found`);

                let analytics = {
                    general: content.stats,
                    performance: {
                        completionRate: content.stats.completionRate,
                        averageTime: contentType === 'ptcAds' ? 
                            content.stats.averageViewTime : 
                            content.stats.averageCompletionTime,
                        deviceDistribution: content.stats.deviceStats
                    },
                    earnings: {
                        total: content.stats.bonkPaid,
                        daily: {}
                    }
                };

                // Process daily stats within date range
                if (dateRange) {
                    const { start, end } = dateRange;
                    Object.entries(content.stats.dailyStats).forEach(([date, stats]) => {
                        const statDate = new Date(date);
                        if (statDate >= start && statDate <= end) {
                            analytics.earnings.daily[date] = stats;
                        }
                    });
                } else {
                    analytics.earnings.daily = content.stats.dailyStats;
                }

                return analytics;
            } catch (error) {
                console.error('Content analytics error:', error);
                return null;
            }
        }
    },

    fraudPrevention: {
        async detectSuspiciousActivity(userId, activityType, details) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.fraudDetection) data.fraudDetection = {
                    suspiciousIPs: [],
                    blockedUsers: [],
                    activityLogs: []
                };

                // Check for rapid activity
                const recentActivities = data.fraudDetection.activityLogs
                    .filter(log => log.userId === userId && 
                            log.timestamp > Date.now() - 3600000); // Last hour

                if (recentActivities.length > 50) { // More than 50 actions per hour
                    await this.flagUser(userId, 'rapid_activity', details);
                    return false;
                }

                // Check for multiple IPs
                const uniqueIPs = new Set(recentActivities.map(log => log.ipAddress));
                if (uniqueIPs.size > 3) { // More than 3 IPs in an hour
                    await this.flagUser(userId, 'multiple_ips', details);
                    return false;
                }

                // Log activity
                data.fraudDetection.activityLogs.push({
                    userId,
                    activityType,
                    timestamp: Date.now(),
                    ipAddress: details.ipAddress,
                    deviceInfo: details.deviceInfo
                });

                await DATABASE.api.updateData(data);
                return true;
            } catch (error) {
                console.error('Fraud detection error:', error);
                return true; // Allow activity if detection fails
            }
        },
        fraudPrevention: {
        async flagUser(userId, reason, details) {
            try {
                const data = await DATABASE.api.getAllData();
                const timestamp = new Date().toISOString();

                if (!data.fraudDetection.flaggedUsers) {
                    data.fraudDetection.flaggedUsers = [];
                }

                data.fraudDetection.flaggedUsers.push({
                    userId,
                    reason,
                    details,
                    timestamp,
                    status: 'flagged',
                    reviewedBy: null,
                    reviewNotes: null
                });

                await DATABASE.api.updateData(data);

                // Log the flag action
                await DATABASE.admin.logAction('system', 'user_flagged', {
                    userId,
                    reason,
                    details,
                    timestamp
                });

                return true;
            } catch (error) {
                console.error('User flag error:', error);
                return false;
            }
        },

        async reviewFlaggedUser(adminId, userId, decision, notes) {
            try {
                const data = await DATABASE.api.getAllData();
                const flaggedUser = data.fraudDetection.flaggedUsers
                    .find(u => u.userId === userId && u.status === 'flagged');

                if (!flaggedUser) {
                    throw new Error('Flagged user not found');
                }

                flaggedUser.status = decision;
                flaggedUser.reviewedBy = adminId;
                flaggedUser.reviewNotes = notes;
                flaggedUser.reviewedAt = new Date().toISOString();

                if (decision === 'blocked') {
                    // Add to blocked users list
                    if (!data.fraudDetection.blockedUsers) {
                        data.fraudDetection.blockedUsers = [];
                    }
                    data.fraudDetection.blockedUsers.push({
                        userId,
                        reason: flaggedUser.reason,
                        blockedAt: new Date().toISOString(),
                        blockedBy: adminId,
                        notes
                    });
                }

                await DATABASE.api.updateData(data);
                return true;
            } catch (error) {
                console.error('Flag review error:', error);
                return false;
            }
        },

        async checkUserStatus(userId) {
            try {
                const data = await DATABASE.api.getAllData();
                const blockedUser = data.fraudDetection.blockedUsers
                    ?.find(u => u.userId === userId);
                const flaggedUser = data.fraudDetection.flaggedUsers
                    ?.find(u => u.userId === userId && u.status === 'flagged');

                return {
                    isBlocked: !!blockedUser,
                    isFlagged: !!flaggedUser,
                    details: blockedUser || flaggedUser || null
                };
            } catch (error) {
                console.error('User status check error:', error);
                return {
                    isBlocked: false,
                    isFlagged: false,
                    details: null
                };
            }
        }
    },

    reporting: {
        async generateDailyReport(date = new Date()) {
            try {
                const data = await DATABASE.api.getAllData();
                const dateStr = date.toISOString().split('T')[0];
                
                // Calculate daily statistics
                const dailyStats = {
                    date: dateStr,
                    users: {
                        total: Object.keys(data.users || {}).length,
                        new: Object.values(data.users || {})
                            .filter(u => u.joinDate?.startsWith(dateStr)).length,
                        active: Object.values(data.users || {})
                            .filter(u => u.lastActivity?.startsWith(dateStr)).length
                    },
                    earnings: {
                        total: 0,
                        bySource: {
                            ptcAds: 0,
                            shortlinks: 0,
                            tasks: 0,
                            referrals: 0
                        }
                    },
                    content: {
                        ptcAds: {
                            total: data.ptcAds?.length || 0,
                            active: data.ptcAds?.filter(a => a.status === 'active').length || 0,
                            views: 0,
                            earnings: 0
                        },
                        shortlinks: {
                            total: data.shortlinks?.length || 0,
                            active: data.shortlinks?.filter(s => s.status === 'active').length || 0,
                            clicks: 0,
                            earnings: 0
                        },
                        tasks: {
                            total: data.tasks?.length || 0,
                            active: data.tasks?.filter(t => t.status === 'active').length || 0,
                            completions: 0,
                            earnings: 0
                        }
                    },
                    fraud: {
                        flaggedUsers: data.fraudDetection?.flaggedUsers
                            ?.filter(f => f.timestamp.startsWith(dateStr)).length || 0,
                        blockedUsers: data.fraudDetection?.blockedUsers
                            ?.filter(b => b.blockedAt.startsWith(dateStr)).length || 0,
                        suspiciousActivities: data.fraudDetection?.activityLogs
                            ?.filter(l => new Date(l.timestamp).toISOString().startsWith(dateStr)).length || 0
                    }
                };

                // Calculate earnings
                Object.values(data.users || {}).forEach(user => {
                    const userDailyEarnings = user.earnings?.daily?.[dateStr] || {};
                    Object.entries(userDailyEarnings).forEach(([source, amount]) => {
                        dailyStats.earnings.total += amount;
                        dailyStats.earnings.bySource[source] = 
                            (dailyStats.earnings.bySource[source] || 0) + amount;
                    });
                });

                // Store report
                if (!data.reports) data.reports = {};
                if (!data.reports.daily) data.reports.daily = {};
                data.reports.daily[dateStr] = dailyStats;

                await DATABASE.api.updateData(data);
                return dailyStats;
            } catch (error) {
                console.error('Daily report generation error:', error);
                return null;
            }
        },

        async getReports(type, dateRange) {
            try {
                const data = await DATABASE.api.getAllData();
                const reports = data.reports?.[type] || {};

                if (dateRange) {
                    const { start, end } = dateRange;
                    const filteredReports = {};
                    Object.entries(reports).forEach(([date, report]) => {
                        if (date >= start && date <= end) {
                            filteredReports[date] = report;
                        }
                    });
                    return filteredReports;
                }

                return reports;
            } catch (error) {
                console.error('Reports fetch error:', error);
                return null;
            }
        }
    },

    notifications: {
        async createNotification(type, message, targetUsers = null) {
            try {
                const data = await DATABASE.api.getAllData();
                if (!data.notifications) data.notifications = [];

                const notification = {
                    id: Date.now().toString(),
                    type,
                    message,
                    targetUsers,
                    createdAt: new Date().toISOString(),
                    status: 'active',
                    readBy: []
                };

                data.notifications.push(notification);
                await DATABASE.api.updateData(data);
                return notification;
            } catch (error) {
                console.error('Notification creation error:', error);
                return null;
            }
        },

        async getUserNotifications(userId) {
            try {
                const data = await DATABASE.api.getAllData();
                return (data.notifications || [])
                    .filter(n => !n.targetUsers || n.targetUsers.includes(userId))
                    .filter(n => n.status === 'active')
                    .filter(n => !n.readBy.includes(userId));
            } catch (error) {
                console.error('User notifications fetch error:', error);
                return [];
            }
        },

        async markNotificationRead(userId, notificationId) {
            try {
                const data = await DATABASE.api.getAllData();
                const notification = data.notifications
                    ?.find(n => n.id === notificationId);

                if (notification && !notification.readBy.includes(userId)) {
                    notification.readBy.push(userId);
                    await DATABASE.api.updateData(data);
                }

                return true;
            } catch (error) {
                console.error('Notification mark read error:', error);
                return false;
            }
        }
    }
};

// Export the database object for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DATABASE;
}
