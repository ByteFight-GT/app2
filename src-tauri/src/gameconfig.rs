//! Static per-game config, bundled at compile time from `/gameconfig.json`
//! (the frontend imports the same file).

use serde::Deserialize;

const GAMECONFIG_JSON: &str = include_str!("../../gameconfig.json");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfig {
    #[allow(dead_code)] // read by the frontend; kept for future per-game data dirs
    pub game_id: String,
    pub maps: MapsConfig,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapsConfig {
    /// Whether this game uses maps at all (map selector, default map seeding).
    pub enabled: bool,
    /// Whether the map builder tab is available (frontend only).
    #[allow(dead_code)]
    pub builder_enabled: bool,
    /// Game ident used for every match when maps are disabled.
    pub singleton_name: String,
}

impl GameConfig {
    pub fn load() -> Self {
        serde_json::from_str(GAMECONFIG_JSON).expect("gameconfig.json is invalid")
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn bundled_config_parses() {
        let cfg = super::GameConfig::load();
        assert!(!cfg.game_id.is_empty());
        assert!(!cfg.maps.singleton_name.is_empty());
    }
}
