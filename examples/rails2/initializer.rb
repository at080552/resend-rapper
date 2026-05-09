# config/initializers/resend_wrapper.rb
require File.expand_path('../../../lib/resend_wrapper_mailer', __FILE__)

ActionMailer::Base.delivery_method = :resend_wrapper
ActionMailer::Base.resend_wrapper_settings = {
  :endpoint => ENV['RESEND_WRAPPER_ENDPOINT'] || 'http://localhost:3000/api/v1/send',
  :api_key  => ENV['RESEND_WRAPPER_API_KEY']  || raise('RESEND_WRAPPER_API_KEY is required')
}
