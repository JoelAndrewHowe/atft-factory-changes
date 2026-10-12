if (args.Length != 4 || args[0] != "--seed" || args[2] != "--target")
{
    Console.Error.WriteLine("Usage: factory --seed <file> --target <folder>");
    return 1;
}
Console.WriteLine("Factory isn't built yet.");
return 0;
