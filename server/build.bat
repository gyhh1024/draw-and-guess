@echo off
call "D:\VS2022\IDE\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
cd /d "E:\Project\draw-and-guess\server"
cargo build
