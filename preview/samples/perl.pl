#!/usr/bin/perl
# Perl: scalars, arrays, hashes and regular-expression operators.
use strict;
use warnings;

my $greeting = "hello";     # scalar
my @names    = qw(ana bob); # list literal
my %score    = ( ana => 10, bob => 25 ); # hash

sub total {
    my (@xs) = @_;          # slurp args into a list
    my $sum = 0;
    $sum += $_ for @xs;     # for-modifier loop
    return $sum;
}

foreach my $name (@names) {
    my $s = $score{$name} // 0;   # defined-or
    if ($name =~ /^a/) {          # regex match (division-like, neutral)
        print "$name: $s\n";
    }
}

my $n = total(1, 2, 3, 0xFF);
print "total=$n\n";
