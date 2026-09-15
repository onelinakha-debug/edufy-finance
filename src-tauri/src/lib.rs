mod auth;
mod commands;
mod db;
mod models;
pub mod server;
mod services;
mod utils;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize database
            let db_path = app_handle
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir")
                .join("edufy.db");

            // Ensure parent directory exists
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }

            let conn = db::connection::init_database(&db_path)?;

            // Store connection in app state
            app.manage(db::connection::DbState(std::sync::Mutex::new(conn)));

            log::info!("Edufy Finance started, database at: {:?}", db_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // School
            commands::school::create_school,
            commands::school::get_school,
            commands::school::list_schools,
            commands::school::update_school,
            // Students
            commands::student::create_student,
            commands::student::get_students,
            commands::student::get_student_detail,
            commands::student::update_student,
            commands::student::delete_student,
            // Grades
            commands::grade::create_grade,
            commands::grade::get_grades,
            commands::grade::update_grade,
            commands::grade::delete_grade,
            commands::grade::promote_students,
            commands::grade::get_promotion_history,
            commands::grade::count_students_in_grade,
            // Fees
            commands::fee::create_fee_structure,
            commands::fee::get_fee_structures,
            commands::fee::add_vote_head,
            commands::fee::get_vote_heads,
            // Invoices
            commands::invoice::generate_invoices,
            commands::invoice::get_invoices,
            commands::invoice::get_invoice_detail,
            // Payments
            commands::payment::record_payment,
            commands::payment::get_payments,
            commands::payment::get_payment_detail,
            // Reports
            commands::report::get_collection_summary,
            commands::report::get_age_analysis,
            commands::report::get_outstanding_report,
            // Settings
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::backup_database,
            commands::settings::get_school_profile,
            commands::settings::update_school_profile,
            commands::settings::list_users,
            commands::settings::create_user,
            commands::settings::update_user,
            commands::settings::delete_user,
            // Discount configs
            commands::fee::get_discount_configs,
            commands::fee::add_discount_config,
            commands::fee::remove_discount_config,
            // Reports
            commands::report::get_student_history,
            // M-Pesa
            commands::mpesa::get_mpesa_config,
            commands::mpesa::save_mpesa_config,
            commands::mpesa::test_mpesa_connection,
            commands::mpesa::initiate_mpesa_payment,
            commands::mpesa::check_mpesa_status,
            commands::mpesa::get_mpesa_transactions,
            commands::mpesa::register_c2b_urls,
            commands::mpesa::start_c2b_server,
            commands::mpesa::get_c2b_transactions,
            commands::mpesa::match_c2b_payment,
            // Dashboard
            commands::dashboard::get_dashboard_stats,
            // Auth
            commands::settings::login,
            // WhatsApp bot + payment links
            commands::whatsapp::lookup_parent_balances,
            commands::whatsapp::generate_payment_link,
            commands::whatsapp::enqueue_whatsapp,
            commands::whatsapp::request_link_otp,
            commands::whatsapp::verify_link_otp,
            commands::whatsapp::list_link_requests,
            commands::whatsapp::reveal_link_code,
            commands::whatsapp::sweep_reminders,
            commands::whatsapp::whatsapp_status,
            // Capitation + compliance
            commands::capitation::preview_capitation,
            commands::capitation::apply_capitation,
            commands::capitation::list_capitation_batches,
            commands::capitation::gazette_return,
            commands::capitation::set_fee_cap,
            // Document vault
            commands::documents::store_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Edufy Finance");
}

/// Run as HTTP web server (for browser/mobile access)
pub fn run_web_server() {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    rt.block_on(server::start());
}
