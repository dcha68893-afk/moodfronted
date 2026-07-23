// deploy.js - Smart deployment script
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DeploymentManager {
  constructor() {
    this.environments = {
      development: {
        project: 'uniconnect-ee95c-dev',
        config: this.getDevConfig()
      },
      staging: {
        project: 'uniconnect-ee95c-staging', 
        config: this.getStagingConfig()
      },
      production: {
        project: 'uniconnect-ee95c',
        config: this.getProdConfig()
      }
    };
  }

  getDevConfig() {
    return {
      apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
      authDomain: "uniconnect-ee95c-dev.firebaseapp.com",
      projectId: "uniconnect-ee95c-dev",
      storageBucket: "uniconnect-ee95c-dev.firebasestorage.app",
      messagingSenderId: "1003264444309",
      appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
    };
  }

  getStagingConfig() {
    return {
      apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
      authDomain: "uniconnect-ee95c-staging.firebaseapp.com",
      projectId: "uniconnect-ee95c-staging",
      storageBucket: "uniconnect-ee95c-staging.firebasestorage.app",
      messagingSenderId: "1003264444309", 
      appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
    };
  }

  getProdConfig() {
    return {
      apiKey: "AIzaSyDHHyGgsSV18BcXrGgzi4C8frzDAE1C1zo",
      authDomain: "uniconnect-ee95c.firebaseapp.com",
      projectId: "uniconnect-ee95c",
      storageBucket: "uniconnect-ee95c.firebasestorage.app",
      messagingSenderId: "1003264444309",
      appId: "1:1003264444309:web:9f0307516e44d21e97d89c"
    };
  }

  async deploy(environment = 'production') {
    if (!this.environments[environment]) {
      throw new Error(`Invalid environment: ${environment}. Use: development, staging, or production`);
    }

    const envConfig = this.environments[environment];
    
    console.log(`🚀 Deploying to ${environment} environment...`);
    console.log(`📦 Project: ${envConfig.project}`);
    
    try {
      // Generate environment-specific config file
      this.generateConfigFile(environment, envConfig.config);
      
      // Switch to correct project
      console.log('🔧 Switching Firebase project...');
      execSync(`firebase use ${envConfig.project}`, { stdio: 'inherit' });
      
      // Deploy
      console.log('📤 Deploying to Firebase...');
      execSync('firebase deploy --only hosting,firestore,storage', { stdio: 'inherit' });
      
      console.log(`✅ Successfully deployed to ${environment}`);
      console.log(`🌐 URL: https://${envConfig.project}.web.app`);
      
    } catch (error) {
      console.error(`❌ Deployment to ${environment} failed:`, error.message);
      process.exit(1);
    } finally {
      // Cleanup
      this.cleanup();
    }
  }

  generateConfigFile(environment, config) {
    const configContent = `
// Auto-generated Firebase configuration for ${environment} environment
// Generated at: ${new Date().toISOString()}
// DO NOT EDIT - This file is auto-generated during deployment

window.firebaseConfig = ${JSON.stringify(config, null, 2)};
window.appEnvironment = '${environment}';
window.deploymentTime = '${new Date().toISOString()}';

console.log('🚀 UniConnect - ${environment} environment');
console.log('🔥 Firebase project:', '${config.projectId}');
`;

    fs.writeFileSync(path.join(__dirname, 'deploy-config.js'), configContent);
    console.log(`✅ Generated deploy-config.js for ${environment}`);
  }

  cleanup() {
    // Remove temporary config file
    try {
      if (fs.existsSync('deploy-config.js')) {
        fs.unlinkSync('deploy-config.js');
        console.log('🧹 Cleaned up temporary files');
      }
    } catch (error) {
      console.warn('⚠️ Could not clean up temporary files:', error.message);
    }
  }

  listEnvironments() {
    console.log('\n📋 Available environments:');
    Object.entries(this.environments).forEach(([env, config]) => {
      console.log(`   ${env.padEnd(12)} -> ${config.project}`);
    });
    console.log('');
  }
}

// CLI execution
const args = process.argv.slice(2);
const environment = args[0] || 'production';

const deployer = new DeploymentManager();

if (['-h', '--help', 'help'].includes(environment)) {
  console.log(`
Usage: node deploy.js [environment]

Environments:
  development   Deploy to development environment
  staging       Deploy to staging environment  
  production    Deploy to production environment (default)

Examples:
  node deploy.js development
  node deploy.js staging
  node deploy.js production
  node deploy.js           # defaults to production
  `);
  deployer.listEnvironments();
  process.exit(0);
}

deployer.deploy(environment);