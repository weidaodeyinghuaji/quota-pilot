use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderType {
    Codex,
    NewApi,
    OpenaiCompatible,
    Openrouter,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderStatus {
    Ok,
    Loading,
    NotInstalled,
    NotLoggedIn,
    Unavailable,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSnapshot {
    pub provider_id: String,
    pub provider_name: String,
    pub provider_type: ProviderType,
    pub account: Option<AccountInfo>,
    pub quota: Option<QuotaInfo>,
    pub usage: Option<UsageInfo>,
    pub balance: Option<BalanceInfo>,
    pub plan: Option<PlanInfo>,
    pub local_estimate: Option<LocalEstimateInfo>,
    pub status: ProviderStatus,
    pub updated_at: String,
    pub error: Option<String>,
}

impl ProviderSnapshot {
    pub fn unavailable(
        provider_id: impl Into<String>,
        provider_name: impl Into<String>,
        provider_type: ProviderType,
        error: impl Into<String>,
    ) -> Self {
        Self {
            provider_id: provider_id.into(),
            provider_name: provider_name.into(),
            provider_type,
            account: None,
            quota: None,
            usage: None,
            balance: None,
            plan: None,
            local_estimate: None,
            status: ProviderStatus::Unavailable,
            updated_at: String::new(),
            error: Some(error.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub account_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaInfo {
    pub window5h: Option<QuotaWindow>,
    pub window7d: Option<QuotaWindow>,
    pub weekly: Option<QuotaWindow>,
    pub total_granted: Option<f64>,
    pub total_used: Option<f64>,
    pub total_available: Option<f64>,
    pub unlimited_quota: Option<bool>,
    pub model_limits_enabled: Option<bool>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindow {
    pub used: Option<f64>,
    pub total: Option<f64>,
    pub remaining: Option<f64>,
    pub used_percent: Option<f64>,
    pub remaining_percent: Option<f64>,
    pub reset_at: Option<String>,
    pub reset_in_seconds: Option<u64>,
    pub pace: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageInfo {
    pub input_tokens: Option<f64>,
    pub cached_input_tokens: Option<f64>,
    pub cache_creation_input_tokens: Option<f64>,
    pub output_tokens: Option<f64>,
    pub total_tokens: Option<f64>,
    pub estimated_cost: Option<f64>,
    pub currency: Option<String>,
    pub cost_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceInfo {
    pub balance: Option<f64>,
    pub currency: Option<String>,
    pub used_amount: Option<f64>,
    pub updated_at: Option<String>,
    pub source: Option<String>,
    pub estimated: Option<bool>,
    pub provider_balance: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanInfo {
    pub name: Option<String>,
    pub total_quota: Option<f64>,
    pub used_quota: Option<f64>,
    pub remaining_quota: Option<f64>,
    pub remaining_percent: Option<f64>,
    pub expire_at: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEstimateInfo {
    pub estimated_cost: Option<f64>,
    pub estimated_remaining: Option<f64>,
    pub currency: Option<String>,
    pub needs_calibration: Option<bool>,
}
