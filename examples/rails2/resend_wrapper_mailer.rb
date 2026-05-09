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
require 'base64'

# Use ActiveSupport's JSON, which is present in any Rails 2 app and works
# on Ruby 1.8 where 'json' is not in stdlib. Falls back to the json gem
# if ActiveSupport happens to be unavailable.
unless defined?(ActiveSupport::JSON)
  begin
    require 'rubygems'
    require 'json'
  rescue LoadError
    raise 'Resend Rapper Rails 2 adapter requires ActiveSupport::JSON or the json gem'
  end
end

module ResendWrapper
  class DeliveryError < StandardError; end

  module Json
    # Hand-rolled JSON encoder so we don't depend on json gem or
    # ActiveSupport::JSON, which on Rails 2.3 + Ruby 1.8 may fall back to
    # a YAML backend that produces YAML-flow output (e.g. {key: "val"})
    # rather than valid JSON ({"key": "val"}).
    def self.encode(obj)
      encode_value(obj)
    end

    def self.encode_value(v)
      case v
      when Hash
        pairs = v.map { |k, val| "#{encode_string(k.to_s)}:#{encode_value(val)}" }
        "{#{pairs.join(',')}}"
      when Array
        "[#{v.map { |x| encode_value(x) }.join(',')}]"
      when String
        encode_string(v)
      when Symbol
        encode_string(v.to_s)
      when Integer, Float
        v.to_s
      when TrueClass, FalseClass
        v.to_s
      when NilClass
        'null'
      else
        encode_string(v.to_s)
      end
    end

    def self.encode_string(s)
      out = '"'
      s.to_s.each_byte do |b|
        case b
        when 0x22 then out << '\\"'
        when 0x5c then out << '\\\\'
        when 0x08 then out << '\\b'
        when 0x09 then out << '\\t'
        when 0x0a then out << '\\n'
        when 0x0c then out << '\\f'
        when 0x0d then out << '\\r'
        else
          if b < 0x20
            out << sprintf('\\u%04x', b)
          else
            out << b.chr
          end
        end
      end
      out << '"'
      out
    end

    # Decode the wrapper's response, which is always simple ASCII JSON.
    # Probe each backend with respond_to? because some old Rails 2.x
    # define ActiveSupport::JSON as a module but not the .decode method.
    def self.decode(str)
      if defined?(::JSON) && ::JSON.respond_to?(:parse)
        return ::JSON.parse(str)
      end
      if defined?(ActiveSupport::JSON) && ActiveSupport::JSON.respond_to?(:decode)
        return ActiveSupport::JSON.decode(str)
      end
      # YAML 1.1 is a superset of JSON for ASCII payloads, and YAML is in
      # the Ruby 1.8 stdlib. This works fine for our wrapper's responses.
      begin
        require 'yaml' unless defined?(YAML)
        parsed = YAML.load(str)
        return parsed if parsed.is_a?(Hash)
      rescue StandardError
      end
      # Last resort: pull the few keys we ever consume from a response.
      result = {}
      result['id']        = $1.to_i if str =~ /"id"\s*:\s*(\d+)/
      result['resend_id'] = $1      if str =~ /"resend_id"\s*:\s*"([^"]*)"/
      result['status']    = $1      if str =~ /"status"\s*:\s*"([^"]*)"/
      result['error']     = $1      if str =~ /"error"\s*:\s*"([^"]*)"/
      result
    end
  end

  class Mailer
    def initialize(settings)
      @endpoint      = settings[:endpoint]      || raise(ArgumentError, ":endpoint is required")
      @api_key       = settings[:api_key]       || raise(ArgumentError, ":api_key is required")
      @host_override = settings[:host_override] # for stunnel-bridge use
      @open_timeout  = settings[:open_timeout]  || 10
      @read_timeout  = settings[:read_timeout]  || 30
      @logger        = settings[:logger]        # any object responding to .info / .debug
      @debug_path    = settings[:debug_path]    # write each request to this file
    end

    def deliver!(mail)
      payload = build_payload(mail)
      body    = ResendWrapper::Json.encode(payload)

      if body.nil? || body.empty? || body == 'null'
        raise DeliveryError,
          "Encoded payload is empty/null. JSON encoder returned #{body.inspect}; " \
          "raw payload inspect: #{payload.inspect[0, 800]}"
      end

      log_debug(body, payload)

      uri = URI.parse(@endpoint)
      req = Net::HTTP::Post.new(uri.request_uri)
      req["Content-Type"]   = "application/json"
      req["Content-Length"] = body_size(body).to_s
      req["X-API-Key"]      = @api_key
      req["Host"]           = @host_override if @host_override
      req.body = body

      http = Net::HTTP.new(uri.host, uri.port)
      http.open_timeout = @open_timeout
      http.read_timeout = @read_timeout
      res = http.request(req)

      unless res.is_a?(Net::HTTPSuccess)
        snippet = body.length > 500 ? body[0, 500] + '...' : body
        raise DeliveryError,
          "ResendWrapper returned #{res.code}: #{res.body}\nSent #{body_size(body)} bytes: #{snippet}"
      end
      ResendWrapper::Json.decode(res.body)
    end

    private

    # Ruby 1.8 has no String#bytesize. .length is byte-oriented in 1.8 and
    # we get a real byte count via .bytesize on 1.9+.
    def body_size(s)
      s.respond_to?(:bytesize) ? s.bytesize : s.length
    end

    def log_debug(body, payload)
      return unless @logger || @debug_path
      msg = "[resend_wrapper] -> #{@endpoint} (#{body_size(body)}B): #{body[0, 1000]}"
      if @logger
        if @logger.respond_to?(:info)
          @logger.info(msg)
        elsif @logger.respond_to?(:write)
          @logger.write(msg + "\n")
        end
      end
      if @debug_path
        begin
          File.open(@debug_path, 'a') do |f|
            stamp = Time.now.respond_to?(:iso8601) ? Time.now.iso8601 : Time.now.strftime('%Y-%m-%dT%H:%M:%S%z')
            f.puts "----- #{stamp} -----"
            f.puts "payload.inspect: #{payload.inspect[0, 2000]}"
            f.puts "encoded body:    #{body[0, 2000]}"
          end
        rescue StandardError
        end
      end
    end

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
