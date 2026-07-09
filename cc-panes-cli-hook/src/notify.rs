use clap::Args;
use serde::Serialize;

use crate::common::http::{post_json, ApiEndpoint};

#[derive(Debug, Args)]
pub struct NotifyArgs {
    #[arg(long, default_value = "custom")]
    kind: String,
    #[arg(long)]
    title: String,
    #[arg(long)]
    body: Option<String>,
    #[arg(long, default_value = "cli")]
    source: String,
    #[arg(long)]
    scope: Option<String>,
    #[arg(long = "dedupe-key")]
    dedupe_key: Option<String>,
    #[arg(long)]
    only_when_unfocused: bool,
    #[arg(long = "metadata-json")]
    metadata_json: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NotifyRequest {
    kind: String,
    title: String,
    body: Option<String>,
    source: Option<String>,
    scope: Option<String>,
    dedupe_key: Option<String>,
    only_when_unfocused: Option<bool>,
    metadata: Option<serde_json::Value>,
}

pub fn run(args: NotifyArgs) {
    match send_notification(args) {
        Ok(response) => {
            println!("{}", response);
        }
        Err(error) => {
            eprintln!("[cc-panes-cli-hook] notify failed: {}", error);
            std::process::exit(1);
        }
    }
}

fn send_notification(args: NotifyArgs) -> Result<String, String> {
    let endpoint = ApiEndpoint::resolve()?;
    let metadata = match args.metadata_json {
        Some(raw) => {
            Some(serde_json::from_str(&raw).map_err(|e| format!("Invalid metadata JSON: {}", e))?)
        }
        None => None,
    };

    let request = NotifyRequest {
        kind: args.kind,
        title: args.title,
        body: args.body,
        source: Some(args.source),
        scope: args.scope,
        dedupe_key: args.dedupe_key,
        only_when_unfocused: Some(args.only_when_unfocused),
        metadata,
    };

    let body =
        serde_json::to_value(&request).map_err(|e| format!("Failed to encode request: {}", e))?;
    post_json(&endpoint, "/api/notifications/trigger", &body)
}
