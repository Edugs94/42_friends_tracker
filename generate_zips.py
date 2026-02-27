import os
import zipfile


def create_zip(source_dir, output_filename):
    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(source_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, source_dir)
                zipf.write(file_path, arcname)
    print(f"Created {output_filename}")


if __name__ == '__main__':
    create_zip('chrome_package', 'chrome_extension.zip')
    create_zip('firefox_package', 'firefox_extension.zip')