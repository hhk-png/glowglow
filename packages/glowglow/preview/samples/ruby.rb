# Ruby: symbols, blocks, string interpolation happens inside double quotes
# but comments, ranges and hashes are all plain to see.

class Greeter
  DEFAULT = { greeting: "hello" }.freeze

  def initialize(name)
    @name = name # instance variable
  end

  def call(loud: false)
    msg = "#{DEFAULT[:greeting]}, #{@name}"
    loud ? msg.upcase : msg
  end
end

names = %w[ana bob carol]
greeters = names.map { |n| Greeter.new(n) }
greeters.each_with_index do |g, i|
  puts "#{i + 1}: #{g.call(loud: i.odd?)}"
end

result = (1..5).select(&:even?).map { |x| x * x }.sum
puts "sum = #{result}" unless result.nil?
