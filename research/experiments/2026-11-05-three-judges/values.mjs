// The values every field of a reader's, screener's or judge's answer may take,
// in one place, so the checks and the scores agree on them.

export const NINE = ["centrality", "source", "act", "fact", "firmness", "reports_his_result", "reports_his_next_fight", "reports_his_health", "he_speaks"];

export const ANSWERS = {
  centrality: ["not_in_content", "only_mentioned", "one_of_several", "main_subject"],
  source: ["himself", "his_team", "his_manager", "opponent_side", "promotion", "other_fighter_side", "media", "fans", "no_one", "none_of_these"],
  act: ["reports_an_event", "speaks_of_himself", "assesses_him", "predicts_his_fight", "calls_him_out", "answers_for_him", "steers_him", "gives_news_of_him", "none_of_these"],
  fact: ["next_fight", "result", "fight_week_event", "health", "career_move", "personal_life", "status_update", "no_fact", "none_of_these"],
  firmness: ["none", "wish", "rumour", "reported", "official_or_done"],
  reports_his_result: ["yes", "no"],
  reports_his_next_fight: ["yes", "no"],
  reports_his_health: ["yes", "no"],
  he_speaks: ["yes", "no"],
};

export const KINDS = ["new_event", "new_remark", "reaction", "analysis", "restatement", "about_someone_else", "no_text"];
export const BODY_PROBLEMS = ["", "navigation", "cut_off", "other_story", "stub", "copy", "other"];
export const FIRST_SOURCES = ["own_interview", "own_report", "official", "fighter_post", "rewrite", "wire", "unclear"];
export const CAREER_EVENTS = ["none", "fight_booked", "fight_changed", "result", "injury", "ranking", "title", "contract_or_move", "retirement"];
export const VERDICTS = ["belongs", "does_not_belong", "own_claim"];
export const CONFIDENCES = ["high", "medium", "low"];

/** The reader's fields a judge sees, and the ones kept out of the public results (they paraphrase the text). */
export const READER_TEXT_FIELDS = ["occasion", "speaker", "also", "note", "claim", "opponent", "event", "rewrite_of"];
