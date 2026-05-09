# config/initializers/resend_wrapper.rb
#
# RAILS_ROOT-based path is the most portable way in Rails 2 — older Ruby
# (1.8.6 / some Passenger setups) resolve File.expand_path('../...', __FILE__)
# differently and end up one level above the app root.

require File.join(RAILS_ROOT, 'lib', 'resend_wrapper_mailer')

ActionMailer::Base.delivery_method = :resend_wrapper
ActionMailer::Base.resend_wrapper_settings = {
  :endpoint => ENV['RESEND_WRAPPER_ENDPOINT'] || 'http://localhost:3000/api/v1/send',
  :api_key  => ENV['RESEND_WRAPPER_API_KEY']  || raise('RESEND_WRAPPER_API_KEY is required')
}
