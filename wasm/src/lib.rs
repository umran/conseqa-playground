//! conseqa in the browser.
//!
//! One entry point, `analyze`, runs the whole `conseqa` / `conseqa-viz`
//! pipeline in-process: parse the YAML source, validate, verify the
//! declared requirements with the model checker, build the obligation
//! report, and extract the system graph and transaction proofs the
//! visualization renders. It returns the same page data `conseqa-viz
//! --json` emits — title, model, graph, transaction proofs, report —
//! alongside the diagnostics the CLIs print to stderr, so the web app
//! can show them inline.
//!
//! The extractors are `conseqa::viz`'s own, straight from the library;
//! nothing here re-implements model semantics.

use serde::Serialize;
use wasm_bindgen::prelude::*;

use conseqa::analyzer::{self, Diagnostic, DiagnosticCode, Severity, report};
use conseqa::parser::yaml::ParseError as YamlParseError;
use conseqa::spec::Model;
use conseqa::viz::{graph, transaction_proofs};

/// The page data the viz front end consumes (`window.CONSEQA`).
#[derive(Serialize)]
struct PageData<'a> {
    title: &'a str,
    model: &'a Model,
    graph: graph::Graph,
    transaction_proofs: transaction_proofs::TransactionProofs,
    report: Option<&'a report::ProverReport>,
}

#[derive(Serialize)]
struct Analysis<'a> {
    /// `None` when the source does not parse.
    page: Option<PageData<'a>>,
    parse_error: Option<ParseError>,
    /// Validation errors, then verification notes and warnings.
    diagnostics: Vec<DiagnosticOut>,
    /// The model parsed and passed validation.
    valid: bool,
    /// The model checker ran (requires a valid model and `verify`).
    verified: bool,
    tally: Option<Tally>,
}

#[derive(Serialize)]
struct ParseError {
    message: String,
    /// 1-based line and column as the YAML parser counts them — in
    /// characters, not bytes — and its 0-based offset, when known. A
    /// DSL-version refusal names the whole document, so it carries no
    /// location at all.
    line: Option<usize>,
    column: Option<usize>,
    index: Option<usize>,
}

#[derive(Serialize)]
struct DiagnosticOut {
    phase: &'static str,
    code: String,
    severity: &'static str,
    subject: Option<String>,
    message: String,
    evidence: Vec<EvidenceOut>,
}

#[derive(Serialize)]
struct EvidenceOut {
    subject: Option<String>,
    message: String,
}

#[derive(Serialize, Default)]
struct Tally {
    proven: usize,
    disproven: usize,
    unknown: usize,
    total: usize,
}

#[wasm_bindgen(start)]
fn start() {
    console_error_panic_hook::set_once();
}

/// Runs the pipeline over `source` and returns the analysis as JSON.
///
/// Verification is only attempted over a valid model, as the `conseqa`
/// CLI does: verdicts are meaningful only over a structurally coherent
/// model. The graph and page data are produced regardless, as
/// `conseqa-viz` does, so imperfect models can still be inspected.
#[wasm_bindgen]
pub fn analyze(source: &str, title: &str, verify: bool) -> String {
    let model = match conseqa::parser::yaml::parse(source) {
        Ok(model) => model,
        Err(error) => {
            // Only a YAML shape error names a place in the document;
            // the version probe refuses the document as a whole.
            let location = match &error {
                YamlParseError::Yaml(yaml) => yaml.location(),
                _ => None,
            };
            let analysis = Analysis {
                page: None,
                parse_error: Some(ParseError {
                    message: error.to_string(),
                    line: location.as_ref().map(|l| l.line()),
                    column: location.as_ref().map(|l| l.column()),
                    index: location.as_ref().map(|l| l.index()),
                }),
                diagnostics: Vec::new(),
                valid: false,
                verified: false,
                tally: None,
            };
            return to_json(&analysis);
        }
    };

    let errors = analyzer::validate(&model);
    let valid = errors.is_empty();

    let mut diagnostics: Vec<DiagnosticOut> = errors
        .into_iter()
        .map(|error| diagnostic_out("validation", &Diagnostic::from(error)))
        .collect();

    let mut tally = None;

    let prover_report = if verify && valid {
        let verification = analyzer::verification::verify(&model);

        diagnostics.extend(
            verification
                .diagnostics()
                .iter()
                .map(|diagnostic| diagnostic_out("verification", diagnostic)),
        );

        let obligations = report::obligations(&model, &verification);

        let mut t = Tally::default();
        for obligation in &obligations.obligations {
            match obligation.status {
                report::Status::Proven => t.proven += 1,
                report::Status::Disproven => t.disproven += 1,
                report::Status::Unknown => t.unknown += 1,
            }
        }
        t.total = obligations.obligations.len();
        tally = Some(t);

        Some(obligations)
    } else {
        None
    };

    let analysis = Analysis {
        page: Some(PageData {
            title,
            model: &model,
            graph: graph::extract(&model),
            transaction_proofs: transaction_proofs::extract(&model),
            report: prover_report.as_ref(),
        }),
        parse_error: None,
        diagnostics,
        valid,
        verified: prover_report.is_some(),
        tally,
    };

    to_json(&analysis)
}

/// The canonical YAML serialization of a model, as conseqa writes it.
/// Returns an empty string when the source does not parse.
#[wasm_bindgen]
pub fn canonicalize(source: &str) -> String {
    conseqa::parser::yaml::parse(source)
        .ok()
        .and_then(|model| conseqa::parser::yaml::serialize(&model).ok())
        .unwrap_or_default()
}

fn diagnostic_out(phase: &'static str, diagnostic: &Diagnostic) -> DiagnosticOut {
    DiagnosticOut {
        phase,
        code: match diagnostic.code {
            DiagnosticCode::Validation(code) => format!("{code:?}"),
            DiagnosticCode::Verification(code) => format!("{code:?}"),
        },
        severity: match diagnostic.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
            Severity::Unknown => "note",
        },
        subject: diagnostic.subject.as_ref().map(|id| id.to_string()),
        message: diagnostic.message.clone(),
        evidence: diagnostic
            .evidence
            .iter()
            .map(|evidence| EvidenceOut {
                subject: evidence.subject.as_ref().map(|id| id.to_string()),
                message: evidence.message.clone(),
            })
            .collect(),
    }
}

fn to_json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|error| {
        // Same shape as a real analysis, every optional field explicitly
        // null, so the page never has to distinguish absent from null.
        serde_json::json!({
            "page": null,
            "parse_error": {
                "message": format!("cannot serialize analysis: {error}"),
                "line": null,
                "column": null,
                "index": null,
            },
            "diagnostics": [],
            "valid": false,
            "verified": false,
            "tally": null,
        })
        .to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../vendor/conseqa/tests/fixtures")
                .join(name),
        )
        .expect("fixture readable")
    }

    #[test]
    fn analyzes_a_valid_model_end_to_end() {
        let json = analyze(&fixture("flash_checkout.yaml"), "flash checkout", true);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(value["valid"], true);
        assert_eq!(value["verified"], true);
        assert_eq!(value["page"]["title"], "flash checkout");
        assert_eq!(value["tally"]["total"], 11);
        assert_eq!(value["tally"]["proven"], 6);
        assert!(value["page"]["graph"]["operations"].as_array().unwrap().len() == 6);
        assert!(value["page"]["report"]["obligations"].as_array().unwrap().len() == 11);
        // The serializability and ordering arguments ride along for the
        // transaction pages.
        assert!(!value["page"]["transaction_proofs"].is_null());
        // The checker's notes surface as diagnostics.
        assert!(value["diagnostics"].as_array().unwrap().iter().any(|d| d["phase"] == "verification"));
    }

    #[test]
    fn reports_parse_errors_with_locations() {
        let json = analyze(&fixture("invalid_service_kind.yaml"), "bad", true);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert!(value["page"].is_null());
        assert_eq!(value["parse_error"]["line"], 6);
        assert_eq!(value["parse_error"]["column"], 15);
        assert!(value["parse_error"]["message"].as_str().unwrap().contains("unknown variant"));
    }

    #[test]
    fn refuses_a_model_that_declares_no_dsl_version() {
        // The two-phase read: the version probe refuses the document by
        // name before the strict parse ever runs, and the refusal has
        // no line to point at.
        let json = analyze("revision: 1\n", "unversioned", false);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert!(value["page"].is_null());
        assert!(value["parse_error"]["line"].is_null());
        assert!(value["parse_error"]["message"].as_str().unwrap().contains("dsl"));
    }

    #[test]
    fn parse_error_locations_count_characters() {
        // The front end turns `line`/`column` into a document offset, and
        // a document offset counts UTF-16 code units. The parser counts
        // neither bytes nor code units but characters, so the mapping has
        // to walk by code point; this pins that contract down.
        let template = |prefix: &str| {
            format!(
                concat!(
                    "dsl: 4\n",
                    "revision: 1\n",
                    "services: {{}}\n",
                    "schemas: {{}}\n",
                    "data_models: {{}}\n",
                    "topics: {{\"{}\": {{messages: [], ",
                    "message_identity: {{kind: XXX}}}}}}\n",
                    "state_machines: {{}}\n",
                    "operations: {{}}\n",
                ),
                prefix,
            )
        };

        // Plain, two-byte, and four-byte (astral) characters ahead of the
        // offending token, all five characters wide.
        for prefix in ["aaaaa", "ééééé", "\u{1F680}\u{1F680}\u{1F680}\u{1F680}\u{1F680}"] {
            let source = template(prefix);
            let json = analyze(&source, "columns", false);
            let value: serde_json::Value = serde_json::from_str(&json).unwrap();

            let line = value["parse_error"]["line"].as_u64().expect("a line") as usize;
            let column = value["parse_error"]["column"].as_u64().expect("a column") as usize;

            let text = source.lines().nth(line - 1).expect("the reported line");
            let at: String = text.chars().skip(column - 1).take(3).collect();

            assert_eq!(at, "XXX", "column {column} of {text:?} should be the bad value");
        }
    }

    #[test]
    fn skips_verification_of_invalid_models_but_still_renders() {
        let source = fixture("minimal.yaml").replace("- OrderCreated", "- Missing");
        let json = analyze(&source, "invalid", true);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(value["valid"], false);
        assert_eq!(value["verified"], false);
        assert!(value["page"]["report"].is_null());
        assert!(!value["page"]["graph"].is_null());
        assert_eq!(value["diagnostics"][0]["phase"], "validation");
        assert_eq!(value["diagnostics"][0]["severity"], "error");
    }
}
