use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewApiProviderConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key_ref: String,
    pub usage_endpoint: String,
    pub balance_endpoint: Option<String>,
    pub plan_endpoint: Option<String>,
    pub refresh_interval_seconds: u64,
    pub timeout_seconds: u64,
    pub retry_count: u8,
    pub pricing_profile_id: Option<String>,
    pub local_balance_mode: String,
}

impl Default for NewApiProviderConfig {
    fn default() -> Self {
        Self {
            id: "new-api-main".to_string(),
            name: "New API".to_string(),
            base_url: String::new(),
            api_key_ref: String::new(),
            usage_endpoint: "/api/usage/token".to_string(),
            balance_endpoint: None,
            plan_endpoint: None,
            refresh_interval_seconds: 300,
            timeout_seconds: 15,
            retry_count: 1,
            pricing_profile_id: None,
            local_balance_mode: "fallback".to_string(),
        }
    }
}
