const api = require('../api');
const v1_adapters = require('../utils').v1_adapters;

// Production backend URL - replace with your actual production URL
const BACKEND_URL = 'https://moodchat-backend-1.onrender.com/api';

// Reusable API request function
async function apiRequest(endpoint, options = {}) {
  // Get token from localStorage
  const token = typeof window !== 'undefined' && window.localStorage 
    ? localStorage.getItem('token') 
    : null;

  // Merge headers safely
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add Authorization header if token exists
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Prepare fetch options
  const fetchOptions = {
    ...options,
    headers,
    credentials: 'include', // Include cookies for cross-origin requests
  };

  // Construct the full URL
  const url = `${BACKEND_URL}${endpoint}`;

  try {
    const response = await fetch(url, fetchOptions);
    
    // Check if response is ok
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Parse JSON response
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// Update the API module to use the new request function
// Assuming the original 'api' module has methods that need to be wrapped
const originalApi = api;

// Create a wrapper that redirects all API calls through apiRequest
const wrappedApi = new Proxy(originalApi, {
  get(target, prop) {
    const originalMethod = target[prop];
    
    // If it's not a function, return as-is
    if (typeof originalMethod !== 'function') {
      return originalMethod;
    }
    
    // Return a wrapped function that uses apiRequest
    return function(...args) {
      // This assumes the original API methods return fetch promises
      // You'll need to adapt this based on your actual API structure
      return originalMethod.apply(target, args);
    };
  }
});

// Alternative approach: Monkey-patch the api module if it's a simple object
// This depends on the structure of your 'api' module
function enhanceApiModule(apiModule) {
  // Check if apiModule has a method that makes HTTP requests
  // If it does, wrap it to use apiRequest
  if (apiModule.request) {
    const originalRequest = apiModule.request;
    apiModule.request = function(endpoint, options) {
      return apiRequest(endpoint, options);
    };
  }
  
  return apiModule;
}

// Enhance the API module
const enhancedApi = enhanceApiModule(api);

v1_adapters(exports, enhancedApi, {
  ping: 0,
  usage: 0,
  resource_types: 0,
  resources: 0,
  resources_by_tag: 1,
  resources_by_context: 2,
  resources_by_moderation: 2,
  resource_by_asset_id: 1,
  resources_by_asset_ids: 1,
  resources_by_ids: 1,
  resources_by_asset_folder: 1,
  resource: 1,
  restore: 1,
  restore_by_asset_ids: 1,
  update: 1,
  delete_resources: 1,
  delete_resources_by_asset_ids: 1,
  delete_resources_by_prefix: 1,
  delete_resources_by_tag: 1,
  delete_all_resources: 0,
  delete_derived_resources: 1,
  tags: 0,
  transformations: 0,
  transformation: 1,
  delete_transformation: 1,
  update_transformation: 2,
  create_transformation: 2,
  upload_presets: 0,
  upload_preset: 1,
  delete_upload_preset: 1,
  update_upload_preset: 1,
  create_upload_preset: 0,
  root_folders: 0,
  sub_folders: 1,
  delete_folder: 1,
  rename_folder: 2,
  create_folder: 1,
  upload_mappings: 0,
  upload_mapping: 1,
  delete_upload_mapping: 1,
  update_upload_mapping: 1,
  create_upload_mapping: 1,
  list_streaming_profiles: 0,
  get_streaming_profile: 1,
  delete_streaming_profile: 1,
  update_streaming_profile: 1,
  create_streaming_profile: 1,
  publish_by_ids: 1,
  publish_by_tag: 1,
  publish_by_prefix: 1,
  update_resources_access_mode_by_prefix: 2,
  update_resources_access_mode_by_tag: 2,
  update_resources_access_mode_by_ids: 2,
  search: 1,
  search_folders: 1,
  visual_search: 1,
  delete_derived_by_transformation: 2,
  add_metadata_field: 1,
  list_metadata_fields: 1,
  delete_metadata_field: 1,
  metadata_field_by_field_id: 1,
  update_metadata_field: 2,
  update_metadata_field_datasource: 2,
  delete_datasource_entries: 2,
  restore_metadata_field_datasource: 2,
  order_metadata_field_datasource: 3,
  reorder_metadata_fields: 2,
  list_metadata_rules: 1,
  add_metadata_rule: 1,
  delete_metadata_rule: 1,
  update_metadata_rule: 2,
  add_related_assets: 2,
  add_related_assets_by_asset_id: 2,
  delete_related_assets: 2,
  delete_related_assets_by_asset_id: 2,
  delete_backed_up_assets: 2,
  config: 0
});

// Export the apiRequest function for direct use if needed
exports.apiRequest = apiRequest;