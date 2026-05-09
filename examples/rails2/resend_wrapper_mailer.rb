# Resend Rapper - Rails 2 client example
#
# Drop this file into your Rails 2 app (e.g. lib/resend_wrapper_mailer.rb)
# and require it from an initializer. It implements a tiny ActionMailer
# delivery method that POSTs to the Resend Rapper HTTP API. Because the
# wrapper accepts plain HTTP, your Rails 2 app does not need a working
# modern OpenSSL/TLS stack to deliver mail through Resend.
#
#   ActionMailer::Base.delivery_method = :resend_wrapper
#   ActionMailer::Base.resend_wrapper_settings = {
#     :endpoint => "http://10.0.0.5:3000/api/v1/send",
#     :api_key  => "rrk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
#   }
#
# This deliberately uses Net::HTTP (not Net::HTTPS) so that an old OpenSSL
# build cannot break delivery. Run the wrapper inside your trusted network.

require 'net/http'
require 'uri'
require 'json'
require 'base64'

module ResendWrapper
  class DeliveryError < StandardError; end

  class Mailer
    def initialize(settings)
      @endpoint = settings[:endpoint] || raise(ArgumentError, ":endpoint is required")
      @api_key  = settings[:api_key]  || raise(ArgumentError, ":api_key is required")
    end

    def deliver!(mail)
      payload = build_payload(mail)
      uri = URI.parse(@endpoint)
      req = Net::HTTP::Post.new(uri.request_uri)
      req["Content-Type"] = "application/json"
      req["X-API-Key"] = @api_key
      req.body = JSON.generate(payload)

      http = Net::HTTP.new(uri.host, uri.port)
      http.read_timeout = 30
      res = http.request(req)

      unless res.is_a?(Net::HTTPSuccess)
        raise DeliveryError, "ResendWrapper returned #{res.code}: #{res.body}"
      end
      JSON.parse(res.body)
    end

    private

    def build_payload(mail)
      payload = {
        :from    => to_addr(mail.from),
        :to      => Array(mail.to),
        :subject => mail.subject.to_s
      }
      payload[:cc]       = Array(mail.cc) if mail.cc && !Array(mail.cc).empty?
      payload[:bcc]      = Array(mail.bcc) if mail.bcc && !Array(mail.bcc).empty?
      payload[:reply_to] = Array(mail.reply_to) if mail.respond_to?(:reply_to) && mail.reply_to

      if mail.respond_to?(:parts) && mail.parts.any?
        html = mail.parts.find { |p| p.content_type =~ %r{text/html} }
        text = mail.parts.find { |p| p.content_type =~ %r{text/plain} }
        payload[:html] = html.body.to_s if html
        payload[:text] = text.body.to_s if text
      else
        body = mail.body.to_s
        if mail.content_type =~ %r{text/html}
          payload[:html] = body
        else
          payload[:text] = body
        end
      end

      attachments = []
      if mail.respond_to?(:attachments)
        mail.attachments.each do |a|
          content = a.respond_to?(:body) ? a.body.to_s : a.to_s
          attachments << {
            :filename       => a.respond_to?(:original_filename) ? a.original_filename : a.filename,
            :content_type   => a.respond_to?(:content_type) ? a.content_type : nil,
            :content_base64 => Base64.strict_encode64(content)
          }
        end
      end
      payload[:attachments] = attachments unless attachments.empty?
      payload
    end

    def to_addr(value)
      v = Array(value).first
      v.is_a?(String) ? v : v.to_s
    end
  end
end

# Hook into ActionMailer (Rails 2.3 style)
if defined?(ActionMailer::Base)
  ActionMailer::Base.cattr_accessor :resend_wrapper_settings if ActionMailer::Base.respond_to?(:cattr_accessor)
  ActionMailer::Base.send(:define_method, :perform_delivery_resend_wrapper) do |mail|
    settings = self.class.resend_wrapper_settings || {}
    ResendWrapper::Mailer.new(settings).deliver!(mail)
  end
end
