// js/auth.account.limit.js - Account Limit Enforcement
(function() {
    'use strict';
    
    const MAX_ACCOUNTS = 2;
    const STORAGE_KEY = 'kynecta_device_accounts';
    
    function getDeviceAccounts() {
        try {
            const accounts = localStorage.getItem(STORAGE_KEY);
            return accounts ? JSON.parse(accounts) : [];
        } catch (error) {
            return [];
        }
    }
    
    function saveDeviceAccounts(accounts) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
            return true;
        } catch (error) {
            return false;
        }
    }
    
    function canRegisterNewAccount() {
        const accounts = getDeviceAccounts();
        const activeAccounts = accounts.filter(acc => !acc.deleted && !acc.expired);
        return activeAccounts.length < MAX_ACCOUNTS;
    }
    
    function registerDeviceAccount(userId, email, username) {
        const accounts = getDeviceAccounts();
        
        // Check if already registered
        const existing = accounts.find(acc => acc.userId === userId || acc.email === email);
        if (existing) {
            existing.lastUsed = Date.now();
            saveDeviceAccounts(accounts);
            return { success: true, existing: true };
        }
        
        // Check limit
        if (!canRegisterNewAccount()) {
            return { 
                success: false, 
                error: `Maximum ${MAX_ACCOUNTS} accounts per device. Please use another device or remove an existing account.` 
            };
        }
        
        accounts.push({
            userId,
            email,
            username,
            registeredAt: Date.now(),
            lastUsed: Date.now(),
            deleted: false
        });
        
        saveDeviceAccounts(accounts);
        return { success: true };
    }
    
    function removeDeviceAccount(userId) {
        const accounts = getDeviceAccounts();
        const index = accounts.findIndex(acc => acc.userId === userId);
        if (index !== -1) {
            accounts[index].deleted = true;
            accounts[index].deletedAt = Date.now();
            saveDeviceAccounts(accounts);
            return true;
        }
        return false;
    }
    
    // Expose globally
    window.AccountLimit = {
        canRegisterNewAccount,
        registerDeviceAccount,
        removeDeviceAccount,
        getDeviceAccounts,
        MAX_ACCOUNTS
    };
    
    console.log('[AccountLimit] Loaded - Max accounts per device:', MAX_ACCOUNTS);
})();